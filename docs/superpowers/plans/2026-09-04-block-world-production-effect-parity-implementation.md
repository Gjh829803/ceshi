# Block World production and effect parity implementation

## Scope and execution graph

This plan implements the frozen production-outcome decision and the effect-relevant behavior retained from
`codex/block-world-main-integration`, under current Babylon Native ownership. Worker success is not
integration proof; each task merges only after its focused contract is green.

| Task | Dependencies | Exclusive owner / output | Mode | Required evidence |
|---|---|---|---|---|
| `BWMI-CF-23A` outcome contract | — | validation/production result types; one `productionOutcome`, separate strict diagnostic union | main-agent-only | parser/canonical/hash fixtures, no legacy alias census |
| `BWMI-CF-23B` runner projection | 23A | reconstruction runner; old-equivalent stage projection and durable strict diagnostic | main-agent-only | CASE-054-shaped strict-failure RED→published GREEN, production-stage negative fixtures |
| `BWMI-CF-23C` atomic publisher | 23A/B | final publisher; integrity without strict semantic veto | main-agent-only | unsafe/stale/partial/fsync/rename fixtures plus strict-failed diagnostic publication |
| `BWMI-CF-23D` Studio projection | 23A-C | Studio status/launch UI | sequential | strict warning with ready/passed; real failure remains failed; Node tests |
| `BWMI-CF-10` Planner causality/admission | — | Planner Skill/checker/Host replay | parallel-safe | entry-first lineage, target masks/recall/aspect, frozen-copy drift |
| `BWMI-CF-19` Builder visual feedback | CF-10 | Native Builder Skill and disposable deterministic renderer | parallel-safe until Host integration | asymmetric entry/top comparisons, same-task repair, post-Native-Check Host pixel replay |
| `BWMI-CF-20/21/22` feasibility/scene/palette | CF-10, CF-19 | Case/Profile/Capture/Evaluation contracts | sequential | CASE-054 budget/feature/color RED fixtures and focused typecheck |
| `BWMI-CF-11/12/14/15` world/Subject/Camera/measurement | CF-10, 20-22 | Host Case/Bootstrap/Capture/Evaluation owners | main-agent-only | local endpoint, target-driven Camera, actual visible pixels, support disposition |
| `BWMI-CF-24` per-target view evidence | CF-10/14/22 | Case/Capture contracts; unique target rows plus per-view evidence disposition | main-agent-only | absent/weak opening mask, top-only presence, real side/top observation, no fabricated bbox |
| `BWMI-CF-31C` Host-only continuation | CF-31B/23/26A/29 | Production/Run/journal/ports; immutable passed-stage checkpoints and explicit Attempt-local recovery output epochs; verifier/publisher consume exact Receipt refs | main-agent-only/sequential | same Run/Attempt/request identity, no prepare/POST during restore, original receipt/context/source byte checks, verified Package rehydration, append-only failure/cleanup history, no overwrite of historical failed output, recovery publication and stale/symlink/unknown negatives |
| `BWMI-CF-22/19` actual Block-group closure | CF-22 manifest/palette join, CF-19 self-check | Native Profile + portable Builder feedback; main-agent-only | Legacy requires groups only for landmark identity presets; remove extra functional-role grouping veto. Preserve Case/actual-target binding and empty/unknown group rejection. Same 054 source now passes isolated Native Check; original Run remains failed. Focused evidence/current status in docs/18 |
| `BWMI-CF-25` WebP source input | CF-09 | immutable input decoder/media admission | sequential | real WebP, malformed/signature mismatch, same-byte hash closure |
| `BWMI-CF-26A` source-repair authority | CF-19/23 | Run/journal and Capture; production purpose independent of Profile, explicit strict acceptance only for external diagnostic repair | main-agent-only/sequential | both Profiles, Host failure and quality observation matrix, journal purpose binding, strict repair 0/1/3, unchanged ordinary outcome authority |
| `BWMI-CF-26B` Cloud terminal task retries | CF-26A, same-request journal | sole task router/recovery; separate durable provider Task Attempt ledger, not another Scene Source/repair loop | main-agent-only/sequential | old Cloud default 3/task-timeout 2, typed failure classes, 30s/120s default delay, local single-task behavior, pending/unknown never re-POST, passed output Hash stability; synchronize single-task principles at activation |
| `BWMI-PROD-10` base visual | CF-23, CF-14/16 | opening-first visual task; same-task self-review + historical Host file/hash/role admission; optional independent review is strict-only | sequential | styled opening anchor then tri-views; independent diagnostic cannot veto; downstream failure preserves whitebox pass |
| `BWMI-PROD-20/30` Episode visual sample | PROD-10 | six Capture + ten variants/reviews/diversity | sequential orchestration; bounded parallel fan-out | exact old terminal/retry/resume matrix and `10/10` closure |
| `BWMI-PROD-40/50/60` full media/cloud | PROD-20/30 | Event/Video adapters, durable DAG, atomic S3 release | main-agent-only integration | six videos per variant, `10/10`, lost-response reconciliation, exact-SHA canary |
| `BWMI-PROD-45` strict media diagnostic | PROD-40 | independent reviewer receipt | parallel-safe | finding never changes ordinary production outcome |

## 2026-09-05 candidate checkpoint

### CF-19 executable task feedback parity and integration boundaries

Main-agent-only, sequential. Own case-preparation instruction + live/frozen Builder Skill;
keep the existing five task outputs, model, three-cycle shared budget, single-task orchestration
and Host identity replay unchanged. Explicitly route the submitted instruction to its actual
`inputs/builder-skill/` copy and complete check/render/view/repair/review sequence. Match the old
completion condition (structural pass + latest images reviewed), not an extra "judged aligned"
similarity admission. Require preparation and Skill regressions, byte-identical frozen copies,
then a fresh real generated Case for effect evidence; old source Capture cannot prove prompt impact.

Integration-only CI closure, existing CF-02/27/19 owners: use the Profile's exported pure shape
subpath instead of a private sibling source import; share the startup reporter from runtime-babylon
instead of importing app internals; explicitly classify synthetic Browser verification fixtures as
test-support and serve their same JSON assets through the verifier's owned asset boundary. Preserve
budgets/behavior and delete replaced file paths; do not weaken workspace-boundaries or add debt.

### CF-31C Capture Request recovery and CF-29 owner-state diagnostics

Main-agent-only, sequential: the existing materializer owns a required closed `outputMode`
(`create` or `verify-or-create`); only Host recovery selects the latter. Recompute the entire
Case/Profile/Attempt/Package/Intent join before comparing exact existing request bytes, reuse only
an identical regular canonical file, and never overwrite it. Fresh duplicate writes still reject.
Required evidence: identical bytes/inode/mtime, changed/symlinked input rejection, missing-file
creation, and real same-Package recovery with no Planner/Builder dispatch.

CF-29 preserves the two existing SDK-owner source dirty/unavailable codes through the Run allowlist.
It does not bypass source-commit verification or make untrusted error text an admission authority.
Real Capture must use unchanged committed implementation inputs. The later authorized CF-29
correction excludes only the progress document and documentary Markdown in specs/plans/reviews;
these edits cannot invalidate SDK identity. Code/config/resource/Skill inputs remain checked.
Required focused evidence: unstaged and staged documentary edits retain identities; mixed source
edits, source deletion/rename into docs, live/frozen Skills and lockfile edits still reject.
Verify a real same-Package production Capture while an authorized progress-document diff exists.
No source regeneration or stricter quality gate is added.

Real recovery evidence: clean `dc643d55`, 054 `run-20260905072747-72050`, Host epoch 2,
ordinary production passed/published and cleanup completed with unchanged Source, generation
identities, Package and Capture Request. Original failures remain in the append-only journal.
Evaluation and strict diagnostics remain failed and do not veto ordinary production; this is not
full visual parity or the complete recovery fault matrix. Live outcome details remain in `docs/18`.

### CF-29 local pre-promotion rejection evidence

Main-agent-only, dependent on the existing local router and CF-31B dispatch identity. The local
adapter owns failure evidence before workspace cleanup: exact declared-output availability,
bounded quarantined output snapshots, and bounded/redacted untrusted final feedback. The Host
selects its evidence destination explicitly in the hashed Native dispatch. Evidence must never
be promoted to Source, restore a failed Generation Receipt, or buy another task. No second success
authority is introduced. Missing/empty/unsafe outputs, task rejection/timeout, immutable evidence,
snapshot limits, secret redaction and unchanged successful delivery require focused tests.

The same batch updates Studio's two stale Planner assertions to the current receipt/replay owner;
it does not restore the deleted validation command. Real Case root-cause certainty is limited by
the evidence actually retained; do not infer a geometry/type failure from `output-missing` alone.

### CF-19/29 type-feedback closure before the next local Case

Execution is main-agent-only; no new provider tasks or ordinary Host source-repair attempts.

| Task | Dependency / exclusive owner | Contract and required evidence |
|---|---|---|
| CF-19 type preflight | existing Skill/checker; `scripts/native-scene/source-typecheck.ts` owns shared compiler options | Build-generated installed SDK/type-library closure and bundled TypeScript; no handwritten API substitute, external checkout or execution. Original 054 tuple errors RED, typed tuple GREEN, API/strict-option negatives and relocated standalone checker. Fresh preflight and comparisons after every source edit, sharing the existing task repair budget. |
| CF-29 concrete type feedback | CF-19; Host bundle diagnostic mapper and production checker report | Bounded/redacted TS code, relative location and actionable message survive into immutable Host self-check evidence. Production retains the allowlisted failure code without changing generation receipt authority. |
| CF-26A affected integration | CF-19/29; existing Run owner | Task preflight failure stays one paid task; no new external repair budget or quality veto. Budget exhaustion remains failure, not an implicit new generation. |
| CF-31C affected integration | CF-29; existing checkpoint/Run owner | Host-only recovery does not re-submit generation, preserves original failures, and refuses changed source/context. This cannot upgrade the original invalid source or prove a repaired source retained its old generation identity. |

This batch adds static type feedback, not all Native admission to the isolated task. Geometry replay,
Ground and formal captures remain separate Host checks. Focused evidence and actual Case progress live
only in `docs/18-refactor-progress-and-backlog.md`; code/tests do not prove model self-repair behavior.
The type-only correction of a disposable copy of the failed 054 source exposed an occupancy rejection.
CF-19 therefore also covers the existing renderer's same-task lattice/overlap feedback using shared
Profile shape functions; off-grid and overlapping inputs must fail before review PNG completion.
No support warning is promoted, and no generated historical source is edited.

### Active 5+2 delegation boundary

User-authorized subagent implementation uses `66dff3a2` plus the preserved candidate changes,
against frozen legacy `9e35ab53c634acaef8c53a33082fff77653f7bbb`. This is an execution
assignment, not a second completion ledger; current status remains in `docs/18`.

| Task | Exclusive files / integration contract | Dependencies and mode | Evidence |
|---|---|---|---|
| CF-26B worker | `scripts/agents/run-lwdp-codex-task.mjs`, same-ID recovery, internal retry policy/ledger and direct tests; generation client error proof if needed. Public outcome retains logical request ID; physical task IDs live in the durable attempt ledger. | Frozen old policy and main-approved internal terminal proof; parallel-safe with CF-31C | Mock provider terminal/unknown/restart matrix, no real POST. Main integrates principles and outcome consumers. |
| CF-24 worker, implementation phase | Case/Capture contracts, identity map, measurement/provider, evaluator/preparation and owner tests. Main owns shared ports/publisher/verifier/Studio. | Approved design §11; parallel-safe under exclusive files. Shared Browser/build/typecheck stay main-owned. | Three after-render observations and PNG/request/map closure; no fabricated projection or ordinary production veto. |
| BWMI-CF-24-INTEGRATION-AUDIT | Read-only scoped Case/Capture/Evaluation and production consumer audit; no mutation or verification processes. | Frozen §11 and integrated core consumers; parallel-safe with owner tests and main Case preparation. | P0/P1 ordinary-veto or evidence-binding findings with exact code; not a whole legacy parity acceptance. |
| CF-31C main | Host checkpoint, Run/journal/ports/recovery tests; all shared publisher/verifier integration. | Existing frozen recovery contract; parallel-safe with CF-26B | Lost checkpoint, stale bytes, same identity/no dispatch, recovery output and publication regressions. |
| Final integration main | Cross-cutting contracts, all documentation/AGENTS and production ports/publisher/verifier; shared typecheck/Browser resources. | Accepted worker deliverables and affected tests; sequential | Worker tests alone are not integration proof. New local 054 Case starts after the batch is integrated; no fresh playability replay. |

Candidate `codex/block-world-effect-alignment@234c1711` implements `BWMI-CF-23`, the historical Planner
entry-first/World-Plan admission thresholds, `BWMI-CF-19`, and the `BWMI-CF-22` exact palette join for
targets that already have Case visual-group rows. It also freezes the initially read reference bytes through
Case preparation, which closes the source-byte half of `BWMI-CF-09`; Request/Receipt-bound Planner
checker/Skill identity remains open. A disconnected route-colored component is diagnostic only at generic
Native Check; required route connectivity remains a Case Ground/Traversal gate.

This checkpoint does not close `BWMI-CF-11/12/14/15/20/21`, does not solve targets omitted from Case when
their opening mask is absent or unreliable (`BWMI-CF-24`), does not add WebP input (`BWMI-CF-25`), and does
not prove exact old external-repair behavior (`BWMI-CF-26`). It is not merged into `main`, and no real
CASE-054, full Browser, repository-wide, or exact-SHA Cloud run is claimed.

## Verification policy

During implementation run only the focused RED→GREEN test, the directly affected Skill drift gate, and
the smallest package/typecheck consumer. Changes to public result contracts additionally require every
direct parser/Studio consumer. The first effect checkpoint follows the bounded R1 scope below: after that
candidate freezes, run one local CASE-054 Scene production pass. Do not attach an explicit strict NBR
verifier to this preliminary effect checkpoint; strict acceptance remains a separate later requested
checkpoint. Ordinary production may pass/publish while strict diagnostics fail. Do not hardcode the
diagnostic outcome of a new generated source, and do not rerun the removed duplicate fresh Browser replay.

The final whole-chain checkpoint is one exact-SHA cloud Scene plus one exact-SHA full Episode. It is not
earned by local unit tests, docs, a worker receipt, or the historical branch's evidence.

## First effect rerun: CASE-054 / R1

Product priority clarified on 2026-09-05: prioritize a demonstrated non-architectural difference from
`9e35ab53` whose repair can improve the next generated scene. Do not substitute new quality inventions,
general hardening, or the shortest unrelated fix for that criterion. Live completion remains exclusively
in `docs/18-refactor-progress-and-backlog.md`; R1 is an implementation/experiment cut, not a new CF work
package or a declaration that its parent tasks are complete.

### Evidence used to select the cut

- Old Builder required complete world geography, reference-relative scale, significant route courses,
  and actual same-task entry/top image inspection. Old production had no equivalent formal 2,000-Block
  cap. The current request still freezes 2,000; the earlier `main@20fe0fef` 054 source used 1,974 and its
  real captures were sparse. This is evidence of budget pressure, not proof that increasing the cap alone
  will fix the result. The old 102,400-Block stress case is not a safe current Native budget.
- The later local 054 on `66dff3a2` has detailed bridge/garden/mountain intent but sparse advisory geometry.
  Its source was deleted by the old cleanup; its repair-cycle count and Block count are unknown. The
  advisory PNGs are not Runtime captures and do not prove which in-task repairs actually happened.
- That local Case retains **all four non-Subject palette targets** (`visual-target-2..5`), including the
  branch bridge/stair network. CF-24's opening-mask omission is a genuine general gap, but not a proven
  cause of this particular output. It is not an unconditional R1 blocker.
- Old Builder explicitly allowed registered G Bot for an ordinary walking person and deferred clothing
  likeness to styling. The current fixed Camera is a real selection/tuning gap; absence of a block-sculpted
  cloak alone is not. The large red advisory cuboid is a Host Subject proxy, not Native-authored anatomy.

### R1 implementation groups and readiness criteria

Before these groups, retain the already implemented input/palette/feedback/outcome and false-rejection
repairs (CF-09/10/19/22/23/28/29/30/32 and CF-26A). Verify only evidence invalidated by the new inputs; do
not redo these as new implementation tasks or call their focused tests a real Case result.

| Order / stable slice | Dependencies and exclusive owner | Minimum repair before R1 | Required focused evidence |
|---|---|---|---|
| 1 — `BWMI-CF-20/R1` representation and usable budget | Existing CF-10/19; Host Generation Request/Profile plus source-selected Planner/Builder context; main-agent-only | Measure a bounded current Native rendering/Capture/Havok workload near and above the 2k pressure point; select one supported candidate ceiling and bind it consistently through request/admission. Align planning granularity with the admitted shapes. Reserve capacity for full-world floor/support, major masses and routes before fine detail; do not silently sacrifice the world to meet a decorative target. Do not copy the old 102,400 ceiling, relax Collider/Physics safety, or introduce a new ordinary visual veto. | Same budget at every direct consumer; measured workload, Block/support/Collider counts and relevant timing/memory evidence; overflow behavior; Skill/copy drift and focused typecheck. Full chunk-size/product performance sweeps remain CF-20, not R1 prerequisites. |
| 2 — `BWMI-CF-11/21/R1` geography and salient structures | R1 representation budget; Case preparation/Builder instruction and same-task review, not Runtime; main-agent-only | Preserve the frozen Brief/World Plan's entry, middle, side/rear and remote regions, real branch courses and elevations. For 054, explicitly track palace mass, bridge/stair network, side towers, waterfall/cliff volumes, gardens, mountain enclosure and negative space through construction priorities and image review. Generic two-ground/12m checks must not become the world-design brief or force a straight replacement for planned geography. Implement only the intent/feedback closure needed by this slice, without manufacturing per-view observation or new semantic identity for every tree/lamp. | Asymmetric branch/elevation/region fixtures and source-derived review comparisons; no fixed sample-scene injection, no empty padding, no arbitrary new failure threshold. R1 rendered assessment uses real entry/top/side views. Full scene-feature measurement and local endpoint acceptance contracts remain open under CF-11/14/21. |
| 3 — `BWMI-CF-12/19/R1` opening framing and effective feedback | Frozen input/Registry identity and R1 scene intent; Host Bootstrap/Camera selection and Skill renderer/Host replay; main-agent-only | Close ground-person opening tuning against the frozen entry composition through the Host owner; advisory and actual Capture must consume the same accepted tuning. Keep the registered walking Subject, not a new Native Subject. Prove both comparison images reflect current source and that the task is instructed to repair the largest position/orientation/scale/depth mismatch within the existing shared three-cycle budget. No extra model repair task or Host similarity scorer. | Non-default tuning and asymmetric source tests; same Bootstrap/tuning across advisory and Capture, stale source/image rejection, complete image-view feedback retained in the real task evidence. If current proxy/framing is already correct, document that evidence rather than invent a proxy bug. Multi-mode Subject support and full Camera product acceptance are not part of R1. |

The three groups are a dependency-ordered main-agent batch, not three additional model calls. Freeze
cross-owner inputs before implementation; a needed contract change must update its parser and direct
consumers together. Do not add a `054`-specific runtime branch, compatibility path, fake planning receipt,
or test-shaped geometry. Completing an R1 slice does not close its parent CF task's remaining contracts.

### When and how to rerun

#### CF-11/R2 local arrival evidence

Execution is main-agent-only, sequential; depends on the existing frozen Case,
Formal Capture intent and verified Block metadata, with no model-stage change.
The Host Case/Intent author owns each metric stand endpoint; the Block identity
binder preserves it while joining the declared visual group; the existing
Runtime Capture measurement alone observes arrival at that endpoint.

Replace `reach-bounds` with current-only `reach-position` in authored and resolved
checkpoint contracts. Require finite `standPositionMetersXYZ`; retain the frozen
Capsule radius and existing tolerance as the local acceptance margin. Group
bounds must no longer define a reach region. Plane criteria retain their existing
group/Collider face proof. No old-kind alias or missing-position fallback is kept.
The production baseline derives its endpoint from the same local stand position
as its Ground band; fixture and direct consumer updates land together. Original
historical Case artifacts remain untouched and do not prove this new contract.

Required evidence: a huge cross-region group cannot make Spawn count as arrival;
asymmetric endpoints, wrong elevation and outside-margin samples reject; a local
valid sample passes; parser requires the endpoint; Hashes bind it; Host binding
preserves it regardless of unrelated group extent; Capture publication and
ordinary/strict outcome separation remain unchanged. This closes the endpoint
slice only. Full Builder-authored geography, non-fixed bounds/routes, region
coverage and CF-21 salient-feature closure remain open under their parent tasks.

#### CF-11/R3 source-authored ground exploration

Main-agent-only and sequential, dependent on R2. Legacy `9e35ab53` Builder
Skill declares distinct middle/remote stand anchors and an honest spawn-to-middle
band; it does not obtain these coordinates from a fixed Host template. Restore
this through required `groundExploration` pure data in the existing authoring
sidecar, checked layout binding and materializer metadata. No extra file, model
task, Runtime route owner, inferred Collider or new repair counter is introduced.

The Case ground policy explicitly selects `case-defined` (existing immutable
metric bands, including strict fixtures and air measurement) or `source-authored`
(ground only, one reachable component, no pre-invented metric bands). The sidecar
must select the same mode. Source-authored intent supplies stable, distinct
middle/remote anchors and ordered-width bands; at least one band starts at the
exact Spawn and ends at a middle anchor. No numeric distance/chunk minima or
semantic image veto are added. The current ground graph is bidirectional; this
batch does not invent one-way Runtime transitions. Pure syntax and policy joins
run in the same portable self-check; actual support, clearance and connectivity
remain the existing trusted Ground analyzer's responsibility.

Ground consumes the Package-bound intent, never writes back to the frozen Case,
and reports the exact authored anchor/band IDs under the existing Case ground
acceptance target. Changed source intent changes manifest/metadata/Package hashes.
Case-defined intent cannot silently override frozen routes, and source-authored
intent cannot omit the old middle/remote or entry-band requirements. Existing
Formal fixed-input diagnostics remain separate and do not dictate generated
geometry in source-authored mode; replacing the generic strict topology/script
template, fixed world bounds and full scene-feature measurement remain CF-11/13/21.
This intermediate boundary is not a second success standard or full CF closure.

Required evidence: missing/duplicate/spawn anchors, missing entry-to-middle band,
wrong mode, extra authority fields, stale identity; a curved real support course
with no straight 12m corridor passes Ground, while unsupported or disconnected
remote anchors fail. Verify immutable input bytes, metadata hash changes, ordinary
outcome separation, direct Package consumers, Skill copies and typecheck.

#### CF-11/R4 checked-layout world bounds

Main-agent-only, sequential, after R3. Frozen legacy `9e35ab53` compiler
`boundsForBlocks` uses all Block extents: XZ center is each min/max midpoint,
horizontal size is `max(16m, span + 9m)`, height range is `[minY - 65m, maxY + 16m]`.
Keep those container numbers, but never recreate the old hidden foundation geometry.

Replace the current Host input with required `NativeSceneWorldBoundsPolicyV1`:
`{mode: "checked-block-layout"}` for ordinary generation or
`{mode: "fixed", worldBounds: WorldPackageWorldBoundsV1}` for explicit fixed inputs.
Use only `inputs/world-bounds-policy.json`; remove the current reusable old file,
not historical runs. This policy is independent of ground mode. Generic Native
can use fixed bounds; checked-block-layout requires actual checked Block evidence.

`scripts/native-scene/world-bounds-policy.ts` owns the closed parser/hash and
resolution. Case preparation, Generation, Host closure, frozen owner identities,
repair/journal/resume and publisher use policy path/bytes/hash, never pretend a
policy hash is the final bounds hash. The existing trusted Package preparation
resolves bounds after its two equal checked replays, before contribution containment.
WorldPackage's concrete bounds contract stays unchanged; Ground, Runtime and
Capture consume that verified manifest. Do not rewrite original inputs or receipts.

Required evidence: exact old formula for asymmetric/translated/extensive scenes,
ungrouped off-camera Blocks included, small worlds do not need added ground,
empty/failed/missing checked evidence rejects, fixed containment retained,
wrong/extra/accessor fields and stale policy identity rejected, immutable policy
through real Native Package/Ground, direct Capture consumer consistency, Skill
live/frozen drift and typecheck. Ordinary success and repair budgets stay unchanged.
Generic Capture templates, complete feature/region measurement and strict routes
remain under CF-11/13/21; R4 alone does not close those parent tasks.

#### CF-11/R5 Capture without invented traversal

Main-agent-only/sequential, after R3/R4. The old `9e35ab53` Builder authors
actual middle/remote anchors and honest ground bands; it is not instructed to
replace geography with a Host-invented 12m straight route. Remove the ordinary
baseline's `entry-to-remote-ground-pass`, 300 Tick input, remote `[0,0,-12]`
criterion and synthetic connects-to relation together. Ground still validates
the Package-bound authored exploration intent and exact Spawn.

Existing required collections explicitly encode the requested work: no declared
scripted checks means empty Case checks, Intent criteria, semantic bindings,
Capture request checks and observation checks. No missing-field fallback, dummy
one-Tick success, new model task or Source repair is allowed. Nonempty checks
retain exact criterion/input identity, reset, Tick and complete observation joins.
An empty traversal observation binds the ordinary Capture ready Snapshot, not an
invented independent route reset. Capture still produces all images, Collider
overlay, Spawn support, immutable observations and Receipt.

The evaluator reports critical traversal as incomplete when no checks are declared;
it cannot obtain a vacuous pass. Attach that diagnostic to the existing Spawn
acceptance obligation. Ordinary production still publishes completed valid output
with strict diagnostics, while explicit NBR strict acceptance rejects a Case with
no scripted checks before starting Browser verification. Current required Case
Ground bands cannot be deleted or reinterpreted by this change.

Required evidence: baseline RED/GREEN; no-script Case→Intent→Package binding→Request
and full provider Capture→Receipt→Evaluation→ordinary publication; zero route
Ticks/resets beyond ordinary Capture; stale/missing/extra requested checks reject;
strict no-script rejection and existing fixed-script controls. Update live/frozen
Skill, consumer contracts and docs/18. Full scene-feature/ground-group coverage
and authored strict route compilation remain CF-11/13/21, not implied complete.

The explicit `pnpm verify:native-no-script-capture` Browser lane reuses the
Package-owner deterministic fixture (stubbed generation, real Native admission,
Ground, Package, Babylon/Havok Capture and Evaluation). It binds zero requested
checks to the Capture ready Snapshot, checks all four PNGs and completed cleanup,
and preserves incomplete traversal diagnostics. It does not submit a model task,
claim reference-image quality parity or run fresh terminal playability. It stays
outside default Vitest and retains inspection evidence in an isolated temporary
directory; the production fixture workspace is cleaned on exit.

#### CF-11/R6 remove synthetic ground visual targets

Main-agent-only/sequential after R3/R5; owner is Case preparation, with exact-set
consumers in validation, Native semantic binding and Capture. Delete the two
generic ground visual rows, remote floor requirement and ground-specific drift
threshold branches. One ground acceptance obligation retains required Spawn support
and all source-authored exploration; no new visual or Runtime authority is added.
Only palette identity landmarks form visual targets. Subject-only scenes preserve
explicit empty semantic/topology sets through Profile, Case, Intent, Native Package,
live Capture and Evaluation; all declared-target bijections still apply.

Evidence: producer RED/GREEN with landmark and Subject-only inputs; nonempty target
and missing/extra group adversarial regressions; actual ungrouped floor
Check/Ground/Package/Capture with SDK Subject and Collider observation; missing
semantic/topology proof remains incomplete without vetoing ordinary production.
Live/frozen Skill/checker copies and docs/18 must match. No new model stage,
source-repair cycle, metric threshold or strict acceptance relaxation. CF-11/21
complete feature coverage and reference-effect evidence remain open.

#### CF-14/24/R1 complete-world inspection bounds

Main-agent-only after CF-11/R4-R6. Replace duplicate container-bound derivations
in formal-capture-request and formal-capture admission with one checked-metadata
inspection-bound owner. Keep minimum spans in the existing Runtime contract owner.
Inputs: every verified Block's center/effective size. Output: one immutable world
inspection bounds value consumed by both side/top and their identity replay.
No new Source, model call, visible-pixel score, or ordinary rejection threshold.

RED/GREEN covers excess container Y margins, asymmetric/off-camera ungrouped Blocks,
inventory order independence, and stale cropped bounds on either view. Verify directly
affected Request/admission/contract tests and typecheck, then freeze before one actual
Browser four-image inspection. Record exact input SHA and residual CF-14/21 work in
docs/18. Native generated checker graph changes use temporary rebuild and byte drift.

#### CF-14/R2-A identity-pixel projection owner

Main-agent-only; depends on the existing admitted Planner identity label map.
`scripts/scenes/identity-mask-projection.ts` owns pixel-count coverage, inclusive-to-exclusive
pixel bounds and the existing basis-point rounding. Case preparation is its first consumer,
replacing its inline measurement with unchanged results and unchanged reliable-component policy.
Measure all admitted pixels of a target, including separated instances; do not count the empty
area between them or fill an arch. No mask produces `not-visible` without fabricated bounds;
that result alone cannot distinguish occlusion, out-of-frame and omitted geometry.

Focused evidence covers same-bounds solid/arch masks, separated instances, absent identities,
exclusive pixel edges, tiny masks and invalid dimensions/labels, plus all Case preparation tests.
This extraction is a prerequisite, not the CF-14 completion: current Formal views are lit
whitebox displays (`babylon-visual-adapter.ts`), so their RGB values must not be silently treated
as an exact identity pass. Subsequent work must bind actual per-view identity pixels to the same
verified geometry, camera and Capture receipt, feed this single projection into Evaluation, and
remove AABB-area-as-silhouette consumption. Keep structural AABB evidence for its actual purpose.
Neither this extraction nor subsequent visual diagnostics adds a model task, ordinary publication
veto or repair budget. Real occlusion/mask capture and complete CF-21 coverage remain open.

#### CF-14/R2-B same-view identity capture

Main-agent-only; the existing artifact-capture transaction owns a requested identity pass after
its display capture and before restoring Camera/materials/canvas. The trusted Host supplies explicit
live mesh handles and colors; never infer target identity from mesh names/tags. Ungrouped scenery and
the SDK Subject still occlude but receive black, as does background. Shared materials must not share
target tint; a thin-instance batch must have one validated target color. Use opaque unlit materials
without changing geometry, instance transforms, camera, viewport or Runtime input/tick state.
Retain the display PNG and expose the identity PNG/RGBA separately; do not replace the user's preview.
Restore all resources on normal/throwing paths and test the exact opening/side/top camera transaction.

Remaining integration consumes the explicit registry at each formal view, binds the three identity
PNG hashes through the observation receipt, and measures their admitted pixels with R2-A. Evaluation
must consume visible-pixel projection for silhouette and retain structural projection only for its
actual spatial uses. No visible pixels means no visible evidence, not automatic geometry-missing
or a newly blocking quality threshold. Runtime/Host schema and persistent consumers change together
when this formal integration activates; the internal capture primitive alone does not close CF-14.

#### CF-14/R2-C formal identity evidence consumers

Main-agent-only; depends on R2-A/B. Require opening/side/top identity PNG refs and hashes
in the current Formal receipt and per-view semantic observations. Publish and validate
the same closed file inventory in Host, Studio, strict verifier and repair inputs.
Evaluation verifies PNG identity/dimensions/CRC and uses the shared pixel projection;
structural AABBs remain only spatial evidence, never a silhouette substitute.
All semantic pixel-drift repair actions use `adjust-geometry`: inspect reference,
identity and display evidence before deciding the cause; do not infer resize/move
from occlusion, clipping, holes or aggregate pixel counts. This does not add an ordinary
production repair task, quality veto, model call or budget.

Evidence: directly affected contracts, publication, Studio, evaluator, repair allowlist,
typecheck and one actual Browser capture after freezing the implementation. A passing
synthetic-generation Browser lane is not a successful model Case or full CF-14 closure.

#### CF-14/R2-D exposed walkable overlay identity

Main agent owns settlement/Capture integration and rendered evidence. The topology/materializer
slice may run in its authorized isolated worker: preserve actual per-top-cell Block/group
ownership in required triangle partitions and explicit live overlay handles. One Collider may
contain multiple visual groups plus ungrouped Blocks. Preserve complete-surface normals,
collision arrays, smoothing and existing Collider budgets. Buried Blocks need no exposed overlay.
Settlement joins the one logical Collider once and retains every visual partition; Capture
colors those handles from checked metadata, never by scanning mesh names, tags or bounds.

Evidence: exact partition coverage, full-surface normals, mixed/ungrouped/buried cases,
tampered/missing/duplicate handles, actual Package admission, typecheck and 3C migration.
The existing no-script Browser fixture must explicitly see all five exposed target tops;
its earlier any-view-only assertion missed black top overlays and is insufficient.
Compare the four display PNGs with the pre-partition capture and inspect identity pixels.

#### CF-14/R2-E adversarial rendered evidence

Main-agent-only; depends on the R2-C/D integration. Extend the existing no-model Browser
verification lane with deterministic geometry cases: solid versus hollow geometry with the
same outer bounds, fully/partially occluded target, separated same-identity instances, and
opening-equivalent geometry differing in side/top. Use existing Native Source/Package/Capture
owners, not a new production route or test-only Runtime truth. Assert real decoded identity
pixels and their bound Evaluation consumption; retain captures for inspection, including on
assertion failure. Verify the original display and Runtime transaction are preserved.
These are regression fixture requirements only, not new ordinary publication thresholds.
Record evidence and remaining parent-task work only in docs/18.

User-authorized ready work at `d9038d17` (2026-09-05):

| Task / mode | Frozen input, dependency and output | Exclusive ownership / evidence |
| --- | --- | --- |
| CF-14/R2-E-MSAA / main-agent-only | R2-D actual pixels reveal adjacent identity colors mixed by default framebuffer MSAA; single-sample identity attachment must preserve Camera/geometry/display | Main owns artifact-capture, its tests, final Browser verifier and all Browser resources; RED adjacent-color leakage, restoration/readback tests, actual GPU evidence |
| CF-14/R2-E-FIXTURES / parallel-safe | Existing Native fixture API at d9038d17; pure named geometry inputs for hollow/occlusion/separated/side-top differences, consumed by the main Browser verifier | cf01-stack-safe worker owns native-semantic-geometry test-support/tests and necessary native-package fixture support only; pure focused evidence, no Browser/Havok/model jobs |
| CF-21/NEXT-COVERAGE-AUDIT / read-only parallel-safe | Legacy 9e35ab53 versus d9038d17; explicit next-batch feature coverage gap/consumer contract/RED proposal | cf29-progress-visibility worker reads Planner/Case/Builder/Capture consumers; no edits or test resources, no new live status |

The main agent integrates worker commits only after inspecting their actual diffs. R2-E Browser
closure depends on both the mask implementation and inspected geometry fixtures; neither worker
success nor single-fixture display invariance alone closes CF-14.

R2-E follow-up at `6a9b1d1a`: `CF-14/R2-E-PIXEL-CLAIMS` is parallel-safe after
the six geometry fixtures are integrated. The worker owns only
`scripts/verification/native-semantic-pixel-claims.test-support.ts` and its test;
input is the frozen seven `NATIVE_SEMANTIC_GEOMETRY_PIXEL_CLAIMS_V1` relations
and decoded target-only masks (width, height, binary occupancy, same-view Camera
signature). Output is a pure fail-closed assertion consumer with focused positive
and adversarial tests. Reuse existing pixel measurement and dependencies where
appropriate; no production parser, threshold, fixture or capture changes. The
main agent separately owns serial Browser captures and CLI orchestration, PNG
decoding and receipt-to-mask binding. No worker Browser/Havok/model jobs. Pair
dimensions and Camera inputs must agree before comparing masks; this test-only
oracle does not alter ordinary production success. Integration depends on both
the inspected consumer and real six-fixture evidence, not synthetic mask tests.

`CF-14/R2-CLOSURE-AUDIT` is a separate read-only worker lane at `6a9b1d1a`:
trace reference/observed semantics and actual Evaluation consumers without any
test, Browser or file mutation. The identified Opening branch must remain an
explicit parent-task gap until a main-agent-owned `CF-14/R2-F-OPENING` closure:
reference pixel regions/anchors currently meet structural AABB observations in
both Evaluation and the explicit strict Host gate, with add/resize/move repair
operations. Reproduce identical visible masks plus wider/offset structural bounds;
derive visual regions/anchors from the existing hash-bound identity decoder,
preserve structural depth/order/distance for spatial use, align the two repair
consumers and their closed operation contract, and deliver rejected identity
images/semantic observation through the existing opening-repair input allowlist.
Freeze the precise consumer contract before implementation. No new stage, retry
budget, ordinary veto, compulsory side/top visibility or causal inference from
missing pixels. Existing side/top presence-required means live identity; explicit
reference-projection-required already supports pixel comparison in each view.
Bound Browser-to-Evidence-to-Evaluation metric assertions remain required. Mask
components are not logical instance IDs, and aggregate metrics do not prove
general shape equivalence; stronger instance/shape contracts cannot be inferred
from these six fixtures.

`CF-14/R2-E-VIEW-CONSUMPTION` can run parallel-safe against `5cbe2925` while the
main agent implements R2-F: worker owns the Native Package fixture's test-only
`semanticReferenceProjections` option and the existing no-script Browser verifier,
not Opening/Runtime/production consumers. An explicit
`--semantic-geometry-reference rear-depth-wall <solid-wall-evidence-root>` mode
uses the retained receipt-bound gate-mass PNG projections as three-view Case
references, through the ordinary Case parser/hash chain. Default presence policy
and all thresholds remain untouched. The receipt's explicit composition binding
also updates that same target's opening region/anchor before freezing the fixture;
the existing Host identity check requires both Case representations to agree.
This only constructs test input and never mutates a production Case. Save EvidenceSet before assertions; require
same Camera inputs and dimensions, per-view decoded projection equality through
Evidence, opening semantic match and side/top semantic drift. Worker runs only
pure input tests/typecheck in an isolated tree; main owns the single real Browser
verification after integration. No new model stage or ordinary success veto.

#### CF-11/21 legacy generation guidance restoration

Ready parallel-safe implementation after CF-21/NEXT-COVERAGE-AUDIT. Frozen legacy reference:
`9e35ab53` Planner Skill navigation/visual-target selection and Block Builder required outcome.
Restore the complete-world creative instruction: one continuous world, explorable footprint at
least four times the reference-visible geographic area (normally twice its width and depth),
with real middle/side/rear/remote geography; empty padding does not count. It is not a new
Host-measured image-area gate. Planner records conservative extension as inference, not user
fact; Native Builder follows the frozen Brief/World Plan and cannot silently rewrite it.
Preserve exact current Block budgets, Source/Runtime ownership and shared repair limits.

Restore the old priority when more than four non-Subject identity-critical wholes compete:
scene-defining person/animal/creature/important object, then primary architecture/natural landmark,
then secondary/repeated formations. Keep one Subject and at most four selected non-Subjects;
ordinary filler stays unselected, and visual identity creates no NPC/Gameplay capability.

Worker ownership: Planner Skill, its block-whitebox-images and scene-brief-template references;
Native Builder Skill and its existing byte-frozen copy; actual native-world-case-preparation
task instruction and focused Planner/preparation/Skill tests. No public schema, parser threshold,
Runtime, Capture, Case artifact or live status mutation. Main owns this contract and integration.
Evidence must inspect the actual frozen instruction/Skill delivery, not merely docs wording,
plus existing max-five/single-Subject parser boundaries and Skill drift. Model effect claims
require later comparable Cases; these tests alone prove instruction delivery, not output quality.
Complete-feature inventory/coverage remains a separate CF-21 diagnostic contract, not an old
field that was lost during migration or a reason to invent a production completeness veto.

#### User-authorized parallel batch at 65d3c2bb (2026-09-05)

The user explicitly authorized subagents while the local 054 Case runs. Two independent
mutation tasks are ready; only these implementation slices become parallel-safe.
Architecture, cross-owner contracts, case execution and final integration stay main-agent-owned.
Workers use separate worktrees and dependency/cache roots; no Browser/Havok/cloud/model jobs.
Neither worker edits live docs, the main Case checkout, artifacts, root dependencies or public schemas.

| Task | Frozen contract / deliverable | Exclusive ownership | Verification / integration |
|---|---|---|---|
| CF-01 stack-safe search | Existing solver input/output, ordering, preference/local costs, tie-break, budget and report Hash remain unchanged; replace recursive DFS with deterministic iterative search | `packages/layout-solver/src/solve.ts` and solver tests, worktree `cf01-stack-safe`; no ready dependency | Reproduce 10k fixed entities, adversarial backtracking/budget/tie fixtures and focused solver tests; return commit/diff to main |
| CF-29 progress visibility | Existing Codex process run/result and submission/retry/timeout contracts remain unchanged. Emit Host-derived, requestId-bound elapsed/output-byte/activity telemetry; never raw model/provider text or inferred semantic stages. Bounded/throttled diagnostics are not a business outcome, and sink errors cannot veto production | `scripts/reconstruction/codex-task-process-port.ts` and its focused tests, worktree `cf29-progress-visibility`; earlier CF-23/28 failure contracts already present at base | Synthetic child/fake timer tests for pre-close progress, split output, silence, cleanup, secret non-disclosure, sink failure and unchanged terminal outcome; return commit/diff to main |

Each worker starts at exact `65d3c2bbdfb1784efca7231f7b6b7d81aa01a4f6`.
Return packet: changed files, RED/GREEN commands, result counts, assumptions and remaining risks.
Main reviews actual changes and integrates only after the current Case releases its frozen code inputs;
worker commits alone are not parent-task completion or integrated evidence.

#### CF-12/R1 activation batch: same-task authored Camera intent

This is the implementation contract; current completion and remaining target-socket,
rendered and real-Case evidence remain exclusively in docs/18.
Static comparison with `9e35ab53`'s `references/subject-camera.md` establishes
that the old Builder adjusts all four opening values inside its existing visual
feedback loop. A Host-only image-to-camera estimate is not a replacement for
that capability, and a fixed Bootstrap consumption fix does not complete it.

All rows below are main-agent-only and sequential; integrate the complete batch
before activating the Skill or running the next Case. Do not publish a partially
accepted optional dialect or treat missing authored values as a fallback.

| Slice | Owner and input/output contract | Integration and required evidence |
| --- | --- | --- |
| CF-12/R1-A | runtime-contracts owns one exact `BabylonNativeInitialCameraV1` parser; Block authoring sidecar adds required `openingCamera` using this shape. Only `mode: third-person` plus distance, target height, pitch and FOV; no Subject, Profile ref, target/entity id, shoulder/yaw offset or Camera object. | Reuse the existing parser rather than fork its shape/ranges; exact-key, finite/range, accessor rejection and immutable output tests. Update every current producer, fixture and frozen checker together when activating the field. |
| CF-12/R1-B | Trusted Host reads the immutable Request/Bootstrap as generation input and admits sidecar intent under the existing selectable third-person Profile ranges. The already-existing authoring/layout binding and Host materializer metadata carry the admitted opening values, bound to the full authoring manifest hash. | Preserve Request, Attempt, original Bootstrap and WRT hashes byte-for-byte. Package root binds the compiled metadata. The sidecar cannot mint receipts or modify the frozen Registry/Subject closure. Test changed intent changes source/binding/metadata/Package identity; stale hashes reject without overwriting original input. |
| CF-12/R1-C | RuntimeHost selects the effective opening values from verified Block metadata for the Block lane; generic Native/Canonical keep their own existing source contract. Camera Director remains the only state owner and retains `a78ca039`'s old-branch Profile/modifier/Preview precedence. | Interactive/Artifact/Formal consume the same admitted values. Do not reinterpret baseline `bootstrapInputHash` as a hash of the admitted override. Update opening gate expected parameters, Ground FOV consumer and every direct Capture consumer to use the same Host resolution. Non-default values, Profile switches, Reset/rollback and metadata tampering coverage. |
| CF-12/R1-D | Same portable checker and renderer consume current sidecar intent; live/frozen Skill tells Builder to tune the four values against entry/subject framing inside the existing shared structural/visual repair budget. | Still three source files plus two PNGs, one logical task and no new reviewer or external repair. New Camera edits invalidate both comparisons. Replayed pixels must bind current source and intent. Preserve actual target-socket precedence and explicitly cover any advisory/Runtime target discrepancy; do not silently call software projection pixel parity. |
| CF-12/R1-E | Main agent integrates A-D and updates current evidence in docs/18. | Focused contracts, Skill drift, directly affected Package/Runtime/Capture gates and typecheck; then one frozen local 054 Case. Ordinary publication policy stays unchanged. Full multi-mode CF-12 and full CF-04 pixel/render-product acceptance remain separately open. |

Do not solve the hash mismatch by editing frozen `inputs/native-scene.bootstrap.json`,
forging a new Generation Request/Receipt after the task, weakening its identity checks,
or writing an untracked runtime-only tuning file. Accepted data is a Host-compiled
projection of existing source bytes, not an additional authoring task or Scene Source.

2026-09-05 fast-feedback amendment: the user subsequently requested "快速推进吧 弄完跑个 case".
Run one **interim budget/feedback probe** after groups 1/2's implemented subset passes focused checks,
without claiming that it is the full R1 readiness checkpoint below. Ground-person Camera selection is
still open: the probe retains the same Host-owned Cloud Ridge Bootstrap and must record framing as a
known confounder. Existing prose/tests do not close asymmetric feature measurement or Camera tuning.
This lets a real local run test the high-value budget/input/self-review changes now; it does not remove
group 3, change ordinary pass/fail, or relabel an incomplete R1 as complete.

Rerun once these three bounded groups have their evidence and the directly affected focused checks are
green. Do not wait for all 21 CF tasks with development remaining. Use the original 054 reference with a
new scene/run identity on one recorded frozen candidate, local `gpt-5.6-sol/xhigh`, and the ordinary Scene
path: Planner → Builder with same-task review → Native Check/Ground/Package → Formal Capture/Evaluation →
publication. Planner/Case/budget/Skill changes invalidate the corresponding historical acceptance; do not
feed the old 054 accepted Case into a new owner contract or claim a new full run from `--build-only`.
No fresh Browser playability replay, Cloud terminal retry, heavy repository gate, or full Episode is
implicitly required by this first local checkpoint.

Record two separate outcomes:

1. **Production:** ordinary `passed` and atomic `published`, with any strict diagnostics intact, no
   false hash/checker rejection, and no unrecorded extra source-repair task.
2. **Preliminary whitebox effect:** inspect same-source real opening/top/side captures against the frozen
   planning views and reference. The palace must retain dominant volume, bridges and stairs must retain
   course/rise, side/rear regions must contain coherent continuation, and waterfalls/cliffs/mountains and
   gardens must not collapse into an empty linear strip. Check metric scale, supporting depth, negative
   space and framing, not only target presence or seven-dimension green status. This is a recorded visual
   assessment, not a newly invented ordinary-publication gate.

These criteria authorize an informative rerun; they do not guarantee the next stochastic generation's
quality. Only the new evidence can establish preliminary effect alignment. A single passing case cannot
establish old-equivalent failure rate, and without same-input old captures it cannot be described as a
quantitative old/new A/B result.

### Second effect checkpoint and deferred work

After a usable R1 whitebox, `BWMI-CF-16` plus `BWMI-PROD-10` adds one base styled opening and its declared
target tri-views: opening generation and self-review first **inside the same Codex task**, then
tri-views consuming that exact accepted styled opening and semantic directions; Host file/hash/role
closure runs after the complete task delivery. The old `9e35ab53` launcher invokes both finalizers
only after its one task returns. Do not turn this into two model tasks or invent a mid-task Host
approval checkpoint. This is the checkpoint for paper/material/appearance
comparison. A raw Block capture must never be compared as though it were the old styled final image.
It does not require ten variants, six videos per variant, or the full Episode.

`CF16/NEXT-VISUAL-CLOSURE-AUDIT` is a read-only, parallel-safe task against `c52f12b8` and
the frozen old `9e35ab53`: trace the automatic visual entry, same-task Skill, declared assets,
opening-to-tri-view dependency, finalizers and Native requested scope. Its deliverable is the
actual consumer map and RED proposals, not an implementation or new status authority. Main owns
the next contract freeze and final integration; no worker starts model/Browser/media jobs.
Restoring the old complete workflow takes priority over adding an independent image scorer.

#### Historical parallel work after CF-14 acceptance

At that checkpoint the user explicitly requested immediate refill of idle workers. Main retains CF-16 cross-cutting
contract/production integration; workers use separate existing worktrees based on `aaae92f6`.
No worktree deletion or new live status authority. Read the actual current owner before editing.

| Task / mode | Frozen contract and exclusive ownership | Required output / resource boundary |
| --- | --- | --- |
| CF06/INSPECTOR-WINDOW / parallel-safe | Playground Feature inspector, `main.ts`, relevant `style.css`, one local windowing helper/tests; same FeatureInspection data and selected feature identity; only rendered row set changes | 5,738/10,000 rows, bounded DOM/overscan, scroll edges, selection/ARIA/dispose. Pure/DOM focused tests only; main integrates Browser evidence. No Runtime/Capture/CanvasRecorder or root dependency edits without coordination. |
| CF07/DIRECT-CANVAS / parallel-safe | `canvas-recorder.ts` and its tests; exact requested raster uses the source canvas stream, mismatched raster retains existing scale-copy implementation | Unchanged 24fps/default size/MIME/output lifecycle; direct path avoids copy timer/canvas; exact/mismatch/resize/throwing cleanup/dispose tests. No inspector/Runtime/visual generation edits or Browser/real encoder until main assigns exclusive lane. |
| CF03/SUPPORT-REPRODUCER / parallel-safe investigation | Current Babylon/Havok checkSupport and existing BodyPort tests, isolated candidate tree; only focused test/reproducer additions, no production owner mutation | Compare old zero-normal case to installed 9.23.0 source and actual current owner. Produce reproducible fake-driver and bounded real-Havok evidence, or explain non-reproduction limits; no fabricated upward normal. Own sole worker Havok lane, no Browser/server/full gates. Runtime fix remains main-agent-owned after a proven RED and frozen correction. |

Workers return exact commit, files, commands/exit codes, remaining evidence and concerns; their
success is not integration proof. Main reuses unaffected evidence and schedules any Browser or
media gate one at a time. Shared contract/package changes return to main before implementation.

CF-03's 86-degree real-Havok zero-normal RED now activates `CF03/SUPPORT-RESOLUTION`,
main-agent-only, dependent on the inspected reproducer commit. Only the existing
BodyPort raw parser and begin projection/transaction wiring change, under the
frozen zero-normal resolution section; no new state or protocol owner. Main runs
the exact RED, directly affected BodyPort/conformance tests, typecheck and
`verify:3c-migration`; whole-candidate final gates remain a later checkpoint.

CF-07 restores old start-time raster selection: a later source-canvas resize does
not switch streams, mutate the canvas or add a failure gate. Direct capture does
not promise fixed encoded raster after such a resize; actual media resize/CPU/frame
evidence remains separate from its unit implementation. After worker delivery,
`CF17/RAW-MEDIA-ADMISSION-AUDIT` is a read-only parallel-safe refill: old/current
raw admission, resampling/padding, finalization and requested-scope failure map,
without encoder/Browser/provider calls. Its output is the next contract/RED proposal,
not permission to add arbitrary duration/aspect/freeze/audio thresholds.

#### Single-agent continuation after worker delivery

The 2026-09-06 user direction supersedes the refill instructions above: do not start
or refill subagents. Continue in the existing `block-world-effect-alignment`
worktree on `codex/cf-production-effect-closure`. Main integrates the delivered
CF-03/06/07/16 changes, retaining unrelated case artifacts and prior design edits.

`CF16/SINGLE-TASK-ENTRY` owns only the post-whitebox Skill, launchers and existing
Host finalizers/Studio consumers. It restores opening-first inspection and exact
accepted-opening tri-view anchoring in one formal Codex task, with at most one
image-level regeneration inside that task. Finalizers run only after complete
delivery. Frozen inputs, request arguments and router ledgers remain available for
reconciliation; no second logical dispatch or intermediate Host handshake. The
single router retains the old Cloud terminal-attempt policy; a single task does
not mean deleting the old provider retries.
Tri-views-only reruns require the accepted opening/prompt and unchanged reference
and target image hashes. The prompt artifact does not prove semantic acceptance.

Required local evidence is the injected-dispatch contract suite, the local/cloud
router smoke without model execution, finalizer regressions, Studio entry tests,
typecheck and census. Runtime/inspector/recorder evidence follows its own unchanged
inputs; do not repeat full gates. This is not the final whole-candidate checkpoint.
Next, main owns Native complete-target capture and requested styling-scope wiring;
real image self-check/repair and Browser/media acceptance remain separate work.
The sole live status and evidence record remains `docs/18-refactor-progress-and-backlog.md`.

#### CF16/26B migration deviation correction

Main-agent-only, sequential, against `origin/codex/block-world-main-integration@9e35ab53`.
The user reconfirmed two hard constraints: add no gate absent from that branch;
preserve its chain parameters, timing and design details. Regression tests measure
parity, not new production admission. New-architecture adaptations must keep those
behaviors; material deviations require user confirmation, not an "optimization" label.

| Stable task | Owner and contract | Dependency / evidence |
|---|---|---|
| CF16/26B-ROUTED-STAGE | Visual launcher supplies `visual-reconstruction` to the existing router; Studio projects that stage for display/usage only, and consumes real formal Cloud markers. No second retry policy. | Actual dispatched stage exercises old maximum/prior attempts, timeout cap and backoff. Studio real child-output ingestion and usage/status regressions. |
| CF16-CAPTURE-DETAILS | Existing Babylon artifact capture + runtime-contracts pixel inspector; old shared scale, background, soft visibility, target activation and per-panel render/flush/inspection retry. No new pixel threshold or publication veto. | Asymmetric real Babylon camera, synthetic immediate/delayed/empty pixels, mid-copy cleanup; old inspector copied with its exact constants. |
| CF16-SEMANTIC-FRONT | Builder declaration through existing mapping, Host capture groups, Runtime request and manifest; retain old cardinal front and Front/Right/Back derivation, plus review-only style. No fixed front inference as a substitute. | Depends on capture details; current-only producer/contract/fixture/Skill closure and direction/render-style regressions, then real rendered inspection. |
| CF16-HOST-TRIVIEW | Existing CLI Browser callback and Host file writer; old four capture attempts with 50ms yields, Runtime pixel inspection, failed PNG/report retention, validate all targets before replacing accepted images. Studio Preview uses the sole runtime-contracts parser. | Depends on semantic-front; serialized callback tests, one missing panel, failure bytes/unchanged accepted images, final manifest direction and Studio Preview integration. No sparse-color alternative or new cutoff. |
| CF16-NATIVE-STYLING | Native declared complete-target evidence and existing post-capture styling scope. | Depends on semantic-front; restore old ordering/accepted opening anchor and downstream failure isolation without another World State or success authority. |
| CF16-NATIVE-FRONT | Existing Native authoring visual group -> checked layout binding -> materializer metadata; preserve the legacy required cardinal `frontDirectionWorldXZ`. Main-agent-only, sequential. | Prerequisite for Native complete-target capture, not a substitute for it. Share the Canonical predicate; bind the declaration in existing manifest/Package hashes; synchronize portable checker and Skill. Test non-default directions, missing/invalid data, frozen vectors and hash changes. Never infer front from Camera, Mesh names, or bounds. |
| CF16-NATIVE-CAPTURE-ADAPTER | Existing `artifact-capture` entity tri-view resolves Native runtime IDs through the existing live registry, isolates selected logical instances, and uses real local vertices plus their authoritative world matrices for bounds. Main-agent-only, sequential; depends on NATIVE-FRONT. | One shared Front/Right/Back renderer and outer cleanup stack. Verify far non-target instance exclusion, original material versus identity tint, shared scale, and early/render/cleanup failure restoration. This is provider capability only; formal payload/publication and styled requested scope remain separate required integration work. No inferred IDs, geometry source, Runtime state, or additional quality gate. |
| CF16-NATIVE-CAPTURE-IDENTITY | Existing source-neutral `VisualCaptureGroupV1` / `WhiteboxTriviewManifestV1` accepts exact Native materializer Runtime IDs without renaming them into Canonical IDs. Main-agent-only, sequential; prerequisite for formal delivery and Native styling. | RED with `native-block:<stable-block-id>`; preserve visual target/path syntax, uniqueness, role/front/color contracts and Canonical-only authoring mapping restrictions. Exercise both existing visual finalizers with unchanged Native IDs, synchronize generated checker copies. This does not by itself populate the formal Request/payload/receipt or launch styling. |

| CF16-NATIVE-FORMAL-DELIVERY | Existing formal Request -> Runtime provider -> hosted payload -> Receipt -> atomic Capture publication -> final publisher/verifier. Main-agent-only, sequential; depends on NATIVE-CAPTURE-ADAPTER and NATIVE-CAPTURE-IDENTITY. | Explicit requested groups bind complete Native metadata groups or the actual controlled Subject; ordered PNG bytes and hashes derive the existing tri-view manifest. Reuse the old four attempts/50ms delay, eight renders per panel, empty-panel inspection and failed-image retention. Cover empty scope, Native/Subject delivery, missing/reordered/stale artifacts and atomic publication failure. Production request preparation still emits an empty scope until Host target selection and Native styled/Studio scope are connected; this slice alone does not close CF-16. |

#### CF16-NATIVE-VISUAL-INPUT

CF16-NATIVE-VISUAL-INPUT (main-agent-only, sequential; depends on requested-scope):
the existing visual task/finalizers select actual capture paths using the existing
canonical/babylon-native discriminator. Native consumes Case-hashed Brief/Palette
and the formal Receipt/derived manifest/PNG hashes, with the Receipt's actual
Snapshot as context. No fabricated Canonical map, root whitebox aliases, separate
quality authority or writes into final/capture. Styled manifests retain real
source-relative capture paths; tri-views-only retains the exact accepted opening.
Focused synthetic tests cover source bytes, stale captures, in-task mutation and
failure isolation. Native scene-launcher and Studio scope integration remain the
next required consumer work; this input path alone does not close CF-16.

#### CF16-NATIVE-SCENE-STUDIO

Main-agent-only, sequential; depends on NATIVE-VISUAL-INPUT. Preserve the pinned
legacy scene launch condition: after successful whitebox production, use the
frozen reference-0, if present, to run the single opening-first visual task.
Plan-only never starts Builder/Capture/styling; build-only never reopens the upload.
No image means no visual task; a whitebox failure never starts styling, and a
visual failure never implicitly reruns Planner/Builder or revokes published whitebox.

Studio projects required styling for reference-backed Native scenes using its
existing fields. It accepts the exact Receipt-derived tri-view directory inventory,
verifies the existing PNG/manifest hashes, serves the original capture paths and
the common styled deliverables, and supports valid zero-script Capture observations
without requiring a fabricated route. Visual failure is a failed overall task with
whitebox production/publishing preserved; Native launch still verifies that closure.
The existing Host finalizer reports/file/hash closure determines visual delivery,
not a new semantic reviewer, similarity cutoff or strict diagnostic veto.

Required evidence: real-parser synthetic stage handoff, no-reference/plan-only/
build-only/failed-child controls; Studio published receipt + actual finalizers,
styled success/failure/missing/stale images, strict diagnostic failure independent,
zero-script Capture and complete-target inventory mutation. These are local
contract tests, not a model/image acceptance run. Interrupted visual recovery,
downstream Recording consumers and the final real Case remain separate open work.

#### CF16-NATIVE-VISUAL-RECOVERY

Main-agent-only, sequential; depends on NATIVE-SCENE-STUDIO. Before the visual
child finishes, the Studio observes the Host's visual-stage boundary, validates
the existing single production result and publication artifacts, and preserves
the whitebox closure in its existing record plus evaluation-run identity. No new
Run/Attempt journal or model job is introduced. The write is serialized and tied
to the active Studio attempt/start time; ambiguous production results are not
retained as an accepted checkpoint.

On restart, an interrupted/running visual task can become ready only from its
same-attempt record, verified Native launch evidence and the existing complete
styled file/hash closure. Missing/stale images, changed Capture, stale evaluation
run and explicit failure remain non-successful, without dispatch. Shutdown keeps
the original failed stage and a published whitebox's passed capture status.
Canonical recovery stays on Canonical evidence; its positive fixture explicitly
selects Canonical rather than wrapping Canonical artifacts in a Native record.

This covers recovery of already delivered outputs. Explicit visual-only retry
for incomplete delivery and downstream Recording consumers remain separate work;
the complete CF goal and final real Case are not closed by this checkpoint.

#### CF16-VISUAL-TASK-REPLAY

Main-agent-only, sequential; depends on NATIVE-VISUAL-RECOVERY. The visual wrapper
records its original task-root/request reference before dispatch, outside model
context. Explicit `--resume` must reuse that exact scope, backend, input bytes,
instruction, arguments and Cloud output prefix. It calls the existing Cloud router
with the original request ID; only that router reconciles unknown requests and
owns the original confirmed-terminal retry ledger/budget. No new retry policy,
quality threshold or independent reviewer is introduced.

After router delivery, retain a Host receipt of the exact declared output bytes.
Resume with this receipt replays the existing finalizers without another model
invocation. A previously promoted output may be restored to staging only from its
exact receipt-hashed live bytes. Changed/malformed references, inputs, instructions,
delivery receipts or outputs cannot become fresh dispatch or accepted residual
files. Native Capture/Package and accepted tri-only opening remain unchanged.

Focused evidence covers unknown Cloud same-request/same-arguments recovery,
changed environment prefix, local Host-only finalization replay after interruption,
post-promotion replay, Native full/tri-only delivery and corruption controls.
Local execution without a delivery receipt is not remotely reconcilable and must
not silently spawn a new model; explicit local terminal recovery remains open.
Studio visual-only retry is the next consumer, not implemented by the wrapper
alone. All remaining CF implementation/alignment precedes the final real Case.

#### CF16-STUDIO-VISUAL-RETRY

Main-agent-only, sequential after VISUAL-TASK-REPLAY. The existing Studio record
and queue own the UI attempt; the original Native Run and visual router retain
their identities. A reference-backed Native record with retained published
whitebox resumes only the existing visual CLI, with `--resume`, original backend
and the Case-hashed reference-0. The upload need not still exist. Changed whitebox
or reference bytes cannot silently select full Planner/Builder generation.

Keep production/publication/strict-diagnostic and Native launch state while
queueing, running or failing the visual retry. Write the new Studio evaluation-run
identity before spawning so its existing restart recovery can consume completed
visual outputs. Revalidate before dispatch and after child termination. The visual
child does not emit or replace the original Native production result. A successful
explicit resume uses the existing finalizer/hash closure; its reused pixels need
not have new modification times matching the Studio retry. Ordinary full-run and
automatic restart freshness checks remain unchanged. No new image reviewer,
similarity threshold, source repair or provider retry budget is introduced.

Required focused evidence: local/cloud CLI routing, success/failure/repeated retry,
unexpected production result, changed Capture/reference, removed original upload,
input change before/during execution, spawn failure, old delivered pixels, and shutdown/restart
with complete visual delivery. Appearance-only failure preserves whitebox; changed
whitebox evidence revokes launch and cannot retain a stale passed UI projection.
Preserve original Capture Receipt/closure and strict
diagnostic; queue/concurrency/stop and existing delivery/recovery behavior must hold.
Local missing-delivery terminal reconciliation, interrupted replay of old-timestamp
delivery under automatic restart, Recording consumers and remaining CF work remain
open. This is synthetic HTTP/process evidence, not a real model Case.

#### CF16-NATIVE-HOST-TARGETS

Main-agent-only, sequential; depends on NATIVE-FORMAL-DELIVERY. The existing formal
Request materializer owns selection from the Case-hashed Native palette, checked
complete metadata groups and Bootstrap controlled Subject. Its explicit capture
scope distinguishes world-only from complete-targets; no missing-file fallback and
no invented Canonical implementation map. Group order/role/class/color come from
the frozen palette, membership/front from checked Native metadata. The Subject
uses the actual Host-owned descriptor and Spawn yaw, never a Builder block proxy.

Necessary Native adaptation: authored Canonical/Native target declarations retain
the old four cardinal fronts. A Host capture group for the controlled Subject may
carry its actual unit world-XZ front: Native Spawn already permits arbitrary yaw,
and the existing tri-view renderer already supports unit directions. Do not reject
a valid Spawn, quantize its yaw, or rotate the Runtime to satisfy an authoring-only
restriction. Canonical map validation remains cardinal. This is capture projection
of existing pose, not a new state owner or a new production gate.

Required focused evidence: nonzero/non-cardinal Subject yaw; complete multi-block
targets in palette order; stale palette bytes, missing/foreign group and unchanged
world-only requests; rehashed request identity on scope/pose changes. Production
requested-scope propagation and styling/Studio remain required downstream wiring;
do not equate the materializer capability with full Native styling completion.

#### CF16-NATIVE-REQUESTED-SCOPE

Main-agent-only, sequential, depends on NATIVE-HOST-TARGETS. Native full/build
scene launch requests complete-targets through the existing reconstruct CLI,
production transaction and capture ports. Standalone reconstruct retains its
world-only default. Freeze the resolved scope with existing Run inputs before
dispatch. Host-only resume without an override reads that exact frozen scope;
an explicit changed scope is stale input, not permission to reuse/relabel the old
Capture. Do not introduce a second Run journal or change source/provider retries.
Focused CLI/launcher/production/port and interrupted-recovery fixtures must prove
propagation, preservation, invalid-input rejection and no extra model dispatch.
Native styling and Studio delivery remain required downstream work.

No entire old file or historical receipt is wholesale restoration authority. Keep
current formal capture/identity/measurement owners intact while porting these behaviors.

#### CF16-LOCAL-DELIVERY

Main-agent-only, sequential after STUDIO-VISUAL-RETRY. The existing local Codex
adapter owns an opt-in Host delivery snapshot, after successful child exit and
all declared outputs have passed the existing file checks, before promotion.
Bind request/task IDs, exact router-forwarded argument hash and ordered output
byte hashes. Keep snapshots outside the model workspace; the last atomic report
rename is the commit marker. Never overwrite original evidence or erase the
original promotion failure. Reuse the existing safe output reader and bounded
snapshots (128 MiB total); unavailable/oversized snapshot evidence logs a diagnostic
but does not add a production veto or change the old local single-task behavior.

The visual wrapper opts in and, if its own delivery receipt was not recorded,
can restore this complete request-bound local snapshot without invoking the router
or model again, then run the existing finalizers. Foreign arguments/request,
missing/partial report, changed/linked snapshots or linked destinations cannot
become accepted residual files. Rejected/unknown/incomplete children never acquire
a successful delivery record; no implicit new local attempt or retry budget.
Required evidence: actual adapter + fake child success/promotion failure/snapshot
failure/child rejection/missing output, retained failure history, same request hash,
safe path/corruption controls, Native visual full/partial restoration and repeated
Host-only replay preserving Capture/whitebox. This does not claim model evidence,
power-loss durability or success recovery when no complete snapshot exists.

#### CF16-RECORDING-ASSETS

Main-agent-only, sequential after Native styling/Studio delivery. Studio remains
the owner of Source selection and published Native launch evidence; Recording
receives that context, not another Native verifier or Canonical authoring alias.
Reference-backed Native whitebox remains recordable when styling fails, while
generation/bundle readiness retains the old required-media predicates. Canonical
standalone availability continues to use its existing authoring artifact.

Consume the current styled manifest's actual whitebox references, joined to the
same target and existing Source capture-path helper. Native uses final/capture
tri-views and its frozen inputs/world-plan.png; never root Canonical decoys or
another target's image. Keep old role/ID ordering, prompt image precedence,
normalization, audio and Seedance parameters, and ZIP layout. No new semantic
review, media threshold or production gate is added by this path adaptation.

Required evidence: both Sources through upload/list/default prompt dispatch and
ZIP copying, original local backend freeze and ordered reference roles, Native
frozen plan bytes and actual whitebox pair bytes, unavailable/unknown Source,
missing/escaping/cross-source/cross-target references, and Studio's real published
Native evidence with strict/visual failure and Capture invalidation. Test model
and video generation are stand-ins; no real paid generation. Native Viewer-side
Recording installation/upload, rendered/media acceptance and remaining CF work
are not closed by API/asset wiring alone.

#### CF16-RECORDING-VIEWER

Sequential slices, all main-agent-only:

| ID | Depends on | Exclusive owner / output | Evidence |
|---|---|---|---|
| CF16-RECORDING-SHARED | CF16-RECORDING-ASSETS | `packages/browser-recording` is the sole browser CanvasRecorder/workbench implementation and scoped stylesheet owner; Canonical route selection stays in Playground. Existing consumers use explicit package exports; no old re-export shims. | Recorder/tests and panel logic/scoped CSS byte comparisons against pre-move `d01e50ab`, direct recorder/consumer tests, census, typecheck, affected production build and workspace dependency checks. |
| CF16-RECORDING-TRANSPORT | CF16-RECORDING-SHARED | Native browser adapter owns exact-session media delivery between the existing hosted frame and trusted shell, separately from deterministic Runtime requests. Reuse CanvasRecorder, no Studio access in the frame. | Cross-origin/source/session/nonce identity, lifecycle and asynchronous recording completion; preserved Runtime request handling and original encoding behavior. Resolve the bounded media delivery contract before editing the bridge. |
| CF16-RECORDING-STUDIO-BINDING | CF16-RECORDING-TRANSPORT | Host launcher/shell binds the exact loaded Package to the existing Studio Native publication; scoped upload/list/media and shared UI, no arbitrary API proxy. | Correct/wrong Package/destination, invalidated publication, upload failure and local backup, repeated recordings and teardown; Native formal Capture/probe routes unchanged. |

Main-agent-only, sequential after CF16-RECORDING-ASSETS. Current inspection:
`startHostedFrame` owns the actual Canvas; `startHostedShell` embeds it through
the credentialless cross-origin Runtime bridge. The bridge accepts only the
existing Runtime request/receipt protocol and rejects unrelated bootstrap
messages. Native launch currently returns an identity-bound CLI entry, not a
Studio same-origin Preview route. Do not install the Canonical panel directly
inside this isolated frame or infer Studio ownership from an arbitrary URL.

Required integration: reuse the single CanvasRecorder implementation and its
old raster/fps/bitrate/timing behavior; keep recording controls and upload/list/
generation UI with the trusted shell; bind any media delivery to the exact
loaded Native package/session and the existing Studio launch identity. The
isolated frame must not gain Studio credentials or general API access. Media
delivery must not become Runtime movement/Camera authority, add a production
gate, or change formal Capture. Resolve shared browser-media ownership and the
transport contract before implementation; no duplicate recorder or permissive
global postMessage side channel.

Required evidence: cross-origin start/stop/byte delivery, exact Canvas selection,
existing encoding defaults, upload failure/local backup, repeated recording,
teardown while recording/stopping, stale session/frame navigation, wrong Source/
Package/Studio destination, and no controls on formal Capture/probe routes.
Synthetic protocol/UI tests are development evidence; real browser recording
and the final production Case remain separate acceptance layers.

The latest user objective supersedes the earlier early-rerun scheduling: finish all CF
implementation and old-branch alignment first; only then run the final local Case and
prove the production chain completes. Do not launch a fresh production/model Case during
partial implementation. Focused synthetic regressions remain allowed. CF-26B/31C, full
CF-13/NBR acceptance, multi-mode CF-12, per-view CF-14/24, feature-scoring CF-21,
inspector/performance and Episode/media retain their full recorded scope; no smaller
subset is redefined as completion.

CF-02 caller alignment uses the existing `capture-startup-watchdog` and existing
runtime-babylon advisory reporter for both Canonical and Native. The Canonical CLI
replaces its direct 30s API wait with the old 180s hard / 45s stall / 250ms poll
budgets, then retains the old single transient-navigation capture retry. Navigation,
stage changes and increasing revisions count as progress; no arbitrary revision
ceiling or suppression of revisited stages. Current Host cancellation and sanitized
failure ownership remain, without another diagnostic global or production gate.
The original `goto` domcontentloaded/30s timeout is unchanged, as in the old branch.
Focused regressions are not real Browser or final production Case acceptance; those
remain after all CF implementation, in the order above.
