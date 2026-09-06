# Block World production and effect parity implementation

## Scope and execution graph

This plan implements the frozen production-outcome decision and the effect-relevant behavior retained from
`codex/block-world-main-integration`, under current Babylon Native ownership. Worker success is not
integration proof; each task merges only after its focused contract is green.

User-confirmed completion rule (2026-09-06): finish all CF implementation and
alignment before the final local production Case. The behavioral authority is
`codex/block-world-main-integration` (local remote-tracking ref verified at
`9e35ab53c634acaef8c53a33082fff77653f7bbb`). If the final chain exposes a mismatch,
follow the old branch's actual logic and correct the new implementation; a
passing new test or successful new run is not permission to retain a deviation.
Do not add gates absent from the old ordinary chain. Preserve its parameters,
stage order, timing, retries and design details under the already frozen Native
ownership boundary. Re-run the affected chain after correcting any mismatch;
do not declare completion on an earlier partial pass. Current execution is
main-agent-only, without subagents.

| Task | Dependencies | Exclusive owner / output | Mode | Required evidence |
|---|---|---|---|---|
| `BWMI-CF-23A` outcome contract | — | validation/production result types; one `productionOutcome`, separate strict diagnostic union | main-agent-only | parser/canonical/hash fixtures, no legacy alias census |
| `BWMI-CF-23B` runner projection | 23A | reconstruction runner; old-equivalent stage projection and durable strict diagnostic | main-agent-only | CASE-054-shaped strict-failure RED→published GREEN, production-stage negative fixtures |
| `BWMI-CF-23C` atomic publisher | 23A/B | final publisher; integrity without strict semantic veto | main-agent-only | unsafe/stale/partial/fsync/rename fixtures plus strict-failed diagnostic publication |
| `BWMI-CF-23D` Studio projection | 23A-C | Studio status/launch UI | sequential | strict warning with ready/passed; real failure remains failed; Node tests |
| `BWMI-CF-10` Planner causality/admission | — | Planner Skill/checker/Host replay | parallel-safe | entry-first lineage, target masks/recall/aspect, frozen-copy drift |
| `BWMI-CF-19` Builder visual feedback | CF-10 | Native Builder Skill and disposable deterministic renderer | parallel-safe until Host integration | asymmetric entry/top comparisons, same-task repair, post-Native-Check Host pixel replay |
| `BWMI-CF-20/21/22` feasibility/scene/palette | CF-10, CF-19 | Case/Profile/Capture/Evaluation contracts | sequential | CASE-054 budget/feature/color RED fixtures and focused typecheck |
| `BWMI-CF-11/12/14` world/Subject/Camera/measurement | CF-10, 20-22 | Host Case/Bootstrap/Capture/Evaluation owners | main-agent-only | local endpoint, target-driven Camera, actual visible pixels |
| `BWMI-CF-15/R1` structural-support instruction parity | pinned old `9e35ab53`, existing Native Check/Ground | live/frozen Builder Skill and output contract; preserve the sole Check/Ground owners | main-agent-only/sequential | Remove invented global-root fill/approval obligations; all palette roles remain advisory, low decoration does not veto a supported Package, missing actual Capsule support still rejects. No new policy, disposition, stage, or repair budget. |
| `BWMI-CF-17/R1` raw-media/conformance parity | pinned old `9e35ab53`, current single-segment runner | existing Seedance runner unchanged; local synthetic media regressions and corrected task contract | main-agent-only/sequential | Byte-identical runner, old scale/pad/fps/tpad/trim behavior, short/static/portrait/silent-stream admission, missing audio rejection, actual first/last pixels and unchanged raw input. No new raw-quality veto. |
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

### CF-15/R1 structural support is not a new production gate (2026-09-06)

The earlier task-table proposal to promote global-root face-contact warnings into a
Case policy/gate is superseded by the user's pinned-old parity requirement. Old
`9e35ab53:packages/block-world/src/check.ts:896-985` validates actual standability,
footprint and clearance; the old Builder's `references/block-api.md:58-70,137-153`
requires reference-supported volume and actual support surfaces, not a world-wide
solid foundation. The same old Native Profile's `check.ts:342-351` explicitly
reports structural-root deficits as warnings, including structural/playable mass.

Keep those metrics and their existing message/severity unchanged. Remove the
current Skill/output-contract demand that an unrelated low decorative Block
requires every floor to extend down to the same bottom. Preserve piers, cliff
volume, deck thickness, arch openings and intended suspended forms according to
the reference. Real visual corrections use the same task's existing image-review
budget; warnings alone do not trigger repair or rejection. Do not introduce a
floating approval/disposition output, Case flag, Host stage or hidden foundation.
Ground still owns actual Spawn/footprint support, clearance and required routes.

Inputs changed: live/frozen generation instructions and focused regression tests.
Evidence required: instruction regression RED-to-GREEN, byte-identical frozen
copies/full Native Builder Skill drift gate, warning severity across all six
palette roles, real Check/Ground/Package with unrelated lower decoration, and the
existing missing-Spawn-footprint negative. No Runtime implementation or production
threshold changed; no models, Browser, real Case or repository-wide checkpoint.

### CF-17/R1 retain the old technical media success contract (2026-09-06)

The current `scripts/visual/run-seedance25-reference-video.py` is byte-identical to
the pinned old file: Git blob `f45783d1304de37a3908e76a8deffbcaf1ce5d1a`.
Lines 266-320 intentionally use scale-to-fit, black padding, fps conversion,
`tpad=clone`, trim, audio padding and final exact raster/fps/frame-count/audio
checks. Missing audio is an existing failure; silence, a short static clip or
different aspect is not a separate raw-media failure. Lines 494-517 record the
raw media measurements and final output hash, then release the temporary raw file.

The old CF-17 proposal to forbid that normalization and add raw duration, freeze,
black-bar or audible-content admission was an enhancement proposal, not a
migration defect. It is superseded by the user's no-new-gate requirement. Preserve
the runner, parameters, timeouts, temporary-file lifecycle and ordinary success
semantics. Technical conformance still does not prove semantic or visual quality.
This amendment also governs raw-admission wording in BWMI-PROD-40: future optional
measurements/review cannot veto ordinary production beyond the pinned old checks.
Do not introduce raw retention, a new disposition/report, a model call or a retry
merely to close CF-17. Full Episode/provider/media effect acceptance remains open.

Verification is the existing local Node media suite plus synthetic short portrait
fixtures with silent audio and missing audio. It invokes only local ffmpeg/ffprobe
and the unchanged conformance function, verifies first/last rendered frame pixels
and raw-byte preservation, and neither submits a provider job nor runs a real Case.

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

#### CF-21/SPATIAL-FORM — restore the full legacy Planner volume intent

Main-agent-only; depends on the guidance restoration above. Pinned old source:
`9e35ab53:.codex/skills/worldkit-spatial-planner/SKILL.md`, sections
`Three-dimensional spatial form`, `Entry composition intent target` and `Completion`.
The current Native image reference retained generic volume guidance, but omitted the
Planner's explicit footprint/longitudinal-profile/cross-section reasoning and the
requirement to record observed vertical connections in the Brief before generating
images. Restore the old spatial-form paragraphs in the Native profile and route the
existing template prose and both PNGs through them. Do not copy the old example's
palace stair or mixed movement modes into unrelated open-ground input.

Owner/output: only the existing Planner Skill and two existing references. The
unchanged Scene Brief parser, exact source bytes and existing Planner context snapshot
remain the transport to Case/Builder. No new inventory schema, required output,
semantic detector, quality veto, model stage or repair allowance. Preserve Canonical
profile semantics. This restores creative instructions, not machine-measured CF-21
coverage; full-scene Capture/Evaluation evidence remains open under the parent.

Evidence: inspect the old paragraphs against the live guidance, parse the shipped
template, and use the actual Planner snapshot producer to prove complete live-file
bytes and hashes reach the immutable task context and survive mutable-source edits.
No string-only regression for the restored wording and no real/model Case at this
development checkpoint. Final visual effect requires the deferred complete chain.

Checkpoint (2026-09-06, `44897be3` plus uncommitted working tree): restored Native
spatial-form body is byte-equal to that old section. The actual snapshot producer
copies the complete three live guidance files, records their byte hashes, and keeps
them unchanged when the mutable source is replaced; the synthetic checker replay
and accepted execution verification both consume that original context. Existing
template/profile/launcher tests plus execution tests pass 24/24 (`pnpm exec vitest
run scripts/agents/planner-skill.test.ts scripts/agents/planner-execution.test.ts
--maxWorkers 1`, exit 0). Skill `quick_validate.py` and `git diff --check` pass.
No checker/schema/generated bundle changed; no prior frozen Planner execution or
user Case was rewritten. This is instruction and transport evidence only; it does
not score features or prove scene completeness. No model, Browser or real Case ran.

#### CF-09/HANDOFF-EXCLUSIVE — Node 25 Planner delivery regression

Main-agent-only; interrupts CF-21 after the reported production failure. Owners:
`scripts/agents/planner-execution.ts` for accepted execution copying and the
Native launcher for failure classification (CF-29). Node 25.8.1 rejects recursive
`cp` onto the target directory that this owner just exclusively created when
`force: false, errorOnExist: true`. Planning and its self-check already passed;
world generation has not started. This is a Host handoff failure, not a quality
gate or a failed model task.

Keep exclusive destination-root reservation, copy each immediate source entry
into an absent child destination, preserve recursive/no-overwrite options and
the unchanged final Request/Skill/receipt verification. Never merge into a
pre-existing task directory, retry with force, replace a paid Planner receipt,
or submit another Planner/Builder to recover a copy failure. Classify a failed
copy at the Native caller with a stable handoff code, retaining the original
exception as cause and a bounded error code, not arbitrary provider/path text.
The existing launcher cleanup continues to remove only its private staged Case
while retaining original Planner delivery. Automatic partial-Case resume is not
silently added by this fix.

Evidence: actual Node 25.8.1 RED/GREEN for existing accepted-execution publication;
nonempty recursive context byte/hash closure; empty/nonempty/symlink destination
conflicts preserve prior data; real synthetic Planner/self-check/Case handoff and
failure classification without model submission or Builder launch. Also run the
direct consumers on the normal local Node version and typecheck. No final full
gate, Browser, live colleague artifacts or paid Case at this checkpoint.

Checkpoint (2026-09-06, `44897be3` plus uncommitted tree): official Node 25.8.1
darwin-x64 archive verified against its published SHA-256
`1e5ebf69955e01216f5c60b9c989d1bdda8e5022e2f60c75e1baf309c5bff50e`, used only
from `/tmp/cf09-node25.qpaByw/node-v25.8.1-darwin-x64/bin/node`; no global/runtime
dependency replacement. Existing publication regression first failed at line 315
with `cp returned EEXIST` on this real binary (exit 1). Node's applicable directory
branch is [the v25.8.1 cp implementation](https://github.com/nodejs/node/blob/v25.8.1/lib/internal/fs/cp/cp.js).
The new launcher classification test also first failed on normal Node 23.11.0,
receiving a raw mkdir error instead of the required handoff code (exit 1).

After copying children of the reserved task directory, Node 25.8.1 runs
`node_modules/vitest/vitest.mjs run scripts/agents/planner-execution.test.ts
scripts/reconstruction/native-world-agent-stages.test.ts --maxWorkers 1`: 26/26,
exit 0. Normal `pnpm exec vitest run` on Node 23.11.0 with those files plus
`scripts/reconstruction/run-native-world-agent.test.ts`: 35/35, exit 0.
`pnpm typecheck` and `git diff --check`: exit 0. The injected post-planning
conflict now reports `NATIVE_WORLD_PLANNER_HANDOFF_FAILED:EEXIST`, retains its
original cause and all five recorded planning files byte-for-byte, verifies the
original accepted receipt, cleans the private stage and makes no Builder call.
Empty/occupied/symlink destination conflicts remain rejected without modifying
prior data. CI pins Node 24.3.0; this checkpoint is not a full CI run. Fix is local
to the CF branch, not a claim of a main release or corrected platform parsing.

#### CF-21/REVIEW-EVIDENCE — whole-scene review bound to existing captures

Main-agent-only; depends on CF-21/SPATIAL-FORM and existing CF-14/24 Capture
identities. Follow the pinned old Planner's human-owned geography/quality review,
not a new semantic detector, Planner JSON output, model stage or ordinary gate.
The reviewer extracts a salient-feature inventory from the exact Case-bound
Brief/reference images and compares it with existing formal opening/side/top
PNGs. A feature may be a landmark, terrain, route, repeated formation, negative
space or macrocomposition, without acquiring visual-target/Gameplay/Collider
identity. Entry/middle/side/rear/remote labels describe review intent, not inferred
Runtime regions. No feature list is auto-invented from names, colors or AABBs.

Local owner: `scripts/reconstruction/scene-feature-review.ts`, an explicit
`review:scene-features` diagnostic command, absent from ordinary production and
CI success decisions. Input is a reviewer-authored inventory/observation file
bound to the Case, Brief and Capture Receipt hashes. Each feature cites an exact
Brief section excerpt or a Case reference-image pixel region. Each required
view records independent presence/completeness/placement judgments, a pixel
region, optional visible-instance count and explanation. Missing/unassessable
observations stay unreviewed; missing/partial/misplaced features stay gaps.
Never sum visible counts across views as if they were distinct instances.

Output is a deterministic diagnostic JSON projection on stdout with its declared
inventory, source/pixel bindings, feature and regional coverage, and explicit
`reviewer-declared` authority. It does not certify that the inventory is exhaustive
or that a reviewer judgment is correct. File/hash/viewport/region and inventory
join checks validate review integrity only. An authentic review with gaps exits
successfully and never changes production outcome, repair budget or frozen files.

Required evidence: non-visual bridge/terrain/formation/negative-space rows remain
distinct even when palace identity passes; only-palace review leaves the rest
unreviewed; side/rear omissions, partial/occluded views and count locality; stale
Case/Brief/Capture/PNG, forged excerpt, duplicate/dangling observations and bad
pixel regions rejected; CLI uses actual parsers/PNG bytes and leaves inputs
unchanged. This develops traceable rendered-review evidence, not automatic
semantic measurement or final 054 acceptance; full parent scope stays open until
the deferred real Case is inventoried and reviewed.

Checkpoint (2026-09-06, `44897be3` plus uncommitted tree): focused review tests
18/18, `pnpm typecheck`, `pnpm test:census` (479 classified tests) and diff check
pass. Census initially rejected the new file's ordering; registration now follows
the existing sorted contract lane. Actual child CLI exits 0 for an authentic
review with gaps, exits 2 for changed Capture PNG bytes, and leaves its input
files unchanged. Synthetic six-feature fixtures cover landmark, route, terrain,
formation, negative space and macrocomposition; they are not visual acceptance.
Usage and evidence limits are documented in
`docs/superpowers/skills/scene-feature-review.md`. No ordinary production gate,
Planner output, semantic detector or additional generation task was added.

The user's latest instruction permits a fresh local ordinary Scene Case after
this in-hand slice is closed, without waiting for every CF parent to finish.
Use the original CASE-054 reference and prompt, trace any failure to the owning
CF task, repair that owner following the pinned legacy behavior, and rerun only
the affected evidence. Do not classify a failed infrastructure/provider task as
missing scene implementation without evidence. No subagents or hidden retries.

#### CF-12/19/HOST-INPUT-REPLAY — source-only delivery versus frozen context

Main-agent-only, sequential; discovered by authorized local
`paper-moon-054-cf-closure-local-0906/run-20260906095814-72302` (2026-09-06).
Planner and delivery passed and the formal Builder exited 0, but Host self-check
rejected before Native Check/Ground/Package/Capture. Its two retained codes were
`NATIVE_BLOCK_BUILDER_AUTHORING_INVALID` and
`NATIVE_BLOCK_BUILDER_VISUAL_IDENTITY_INPUT_INVALID`. The source-only directory
does not contain task inputs. The portable checker incorrectly read Subject
context and Native Bootstrap relative to that directory, whereas Brief/Case and
palette already came from explicitly selected frozen inputs.

Owner: `scripts/agents/agent-native-block-builder-self-check.mjs` and its built
live/representative frozen copies. Use the existing explicit palette path's
containing frozen input bundle for both Subject files in task and Host replay.
No candidate-local fallback, new CLI mode, output, admission condition or retry.
Regression: isolated and source-only reports must be identical; actual production
subprocess adapter exercises the split layout; candidate-local decoys do not
override frozen inputs, and invalid frozen context/Bootstrap remain rejected.
The three initial reproducer cases were RED (false rejection and two false
acceptances). Focused Skill/production-port tests and typecheck are the required
reruns; this is not the final full-gate checkpoint.

Exact rejected Source, authoring and resource bytes remain immutable. With the
patched live checker their standalone self-check passes, without another model
call; this diagnostic replay does not rewrite the rejected Generation Receipt
or make that original Run successful. Source SHA-256 is
`1f79571dfdcd221f50d9536f73aec5b25e3cffbad71052b56707a41c2670c2ec`.
Independent source-only advisory replay records 7,868/8,000 Blocks, including
2,580 ground, 480 route, 2,168 structure, 2,166 background and 474 water-like
Blocks. Reports are in `/tmp/cf054-source-budget-HVa7Cf/` and are not Runtime
Capture. Actual inspected advisory views still omit extensive valley/ridge mass
and show weak elevation/extent fidelity. CF-20 representation/budget and CF-11/21
geographic construction remain required; do not declare the scene accepted from
a corrected self-check. No second Case or main merge before that acceptance.

Checkpoint: actual portable Skill + production-port test files pass 123/123
(including all three RED-to-GREEN cases and the real subprocess adapter),
`pnpm typecheck` and diff check pass. The live portable checker and tracked
representative frozen copy were rebuilt/synchronized; the executed 054 Case's
frozen checker, Source, receipts and history were not changed. No full CI,
independent review, second paid Case, commit, push or merge was performed.

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

#### CF-12/M ordered movement intent and Host selection

Main-agent-only, sequential. Pinned behavior is `9e35ab53`: preserve 1-8 ordered
movement rows, including standard labels with parenthesized equipment and custom
labels. Never collapse the request to the first mode or claim that parsing a mode
implements its Runtime capability. The current-only break replaces singular
Brief/Palette/CLI fields and the single-line template together; no dual parser,
alias or default single-mode fallback. Historical generated run receipts remain
evidence of their recorded inputs, not newly verified current-contract evidence.

| Task | Owner, dependencies and contract | Required evidence |
| --- | --- | --- |
| CF-12/M-A | Authoring Brief parser, Host Palette writer/parser, CLI and Planner checker; no dependency on new Runtime work. Restore old ordered list and mixed-ground semantics; preserve existing target/provenance contracts and thresholds. | Single/multiple/custom/annotated labels, count/duplicate/removed syntax, order-bound Hash, mixed modes with ground not first, source/bundle parity, direct consumers and typecheck. |
| CF-12/M-B | Planner Skill/template and all current fixtures consume M-A. Regenerate portable checker bundles and frozen copies from their existing producer. Native Subject/Physics/Camera remain exclusively Host-owned; Canonical retains its own authoring contract. | Template parsed by actual parser, no conflicting single-mode instruction, live/frozen drift checks. No model task or extra quality gate. |
| CF-12/M-C | Existing Host generation preparation and Registry/Bootstrap selection, depends on M-A/B. Bind complete requested modes and primary visual identity to honest supported Subject/capability selection, without another Planner/Mapper task or silent fixed G Bot substitution. | Old-to-current capability mapping, unsupported/approximation disposition where genuinely necessary, complete identity/Hash propagation and focused real Runtime consumers. This remains required after M-A/B. |

Real model/visual/playable acceptance follows completion of all CF development,
not merely M-A/B. CF-04 Camera pixel/interpolation work remains separate.

M-A/B implementation checkpoint (2026-09-06): parser, Palette, CLI, mixed-mode
Planner checks and Skill/template are connected, with source-generated portable
tools and the current strict Corpus Brief/Case raw Hash updated together. The
historical Canonical scenes and `runs/` remain unchanged; current test inputs use
the maintained template. Direct contract tests, a serial rerun of the one
30-second drift-test timeout, Native Skill 67/67, CLI/Package-owner smoke,
bundle drift and typecheck pass; detailed non-aggregate evidence is in docs/18.
The optional Skill Python validator lacked PyYAML; existing Node YAML validation
and actual source/bundle behavior tests cover the checked replacement scope.
M-C is still unimplemented, not reduced to a parser capability claim.

M-B dispatch correction (2026-09-06, after `043f21e3`): the shell launcher's
actual Planner prompt still required exactly one mode despite the changed Skill.
That conflict is now removed. The regression executes the complete prompt
assignment block for both Source Profiles, including later appended instructions,
and preserves the original three self-repair cycles and one Host replay. The
Planner test file passes 9/9; no model task, new production gate or Skill change.

M-C input evidence at this checkpoint: all 30 current discoverable Subject refs
were probed through the existing Authoring normalizer and Canonical compiler in
the existing valid test world. The 24 successful Runtime descriptors expose only
the ground capability and free-ground default/kernel; six other catalog entries
fail existing capability normalization. These counts describe current compiled
closures, not Browser acceptance or a pinned-old execution. The old authoring
catalog also uses a compile probe before exposing executable movement modes.
Do not implement a name-based flight/vehicle/water selector or treat declared
Kernel `supportedMediums` alone as an executable locomotion capability. M-C must
still close complete Subject shape, actual capabilities and frozen identities
through the existing Host/compiler owners; a silent G Bot fallback or new early
production veto is not completion.

M-C prerequisite batch (main-agent-only, sequential; baseline `66d8ebc5`):

| Task | Exclusive owner and contract | Evidence / integration dependency |
| --- | --- | --- |
| CF-12/M-C1 | Compiler: extract the existing normalized Subject/resources-to-Runtime projection into one source-neutral implementation. Canonical compilation calls that same owner; input needs only normalized Subject/resource/placement data, not terrain, world settings, a Canonical Scene Plan or another Runtime. Preserve every field, resource lock check, diagnostic and default. This is trusted compilation, not an untrusted-input admission API. | Pre-extraction Runtime/Scene hashes for registered, package primitive and rigged Subjects; direct projection parity, deterministic ordering/input immutability, existing malformed resource/relationship/medium regressions, compiler tests/typecheck and affected portable bundle drift. No model task or added production gate. |
| CF-12/M-C2 | Native Host Subject preparation consumes C1 together with existing Authoring normalization and Registry owners; close requested shape/modes and selected compiled capability identity. Do not create a synthetic Canonical world as Native production truth, copy the compiler, or select executable modes by name. | Depends on C1 and the explicit Native Host input/output activation; close source, Request/Attempt, proxy, Package, Capture and resume identities together. C1 alone does not replace the fixed G Bot or complete M-C. |

C1 implementation checkpoint: Canonical now consumes the extracted
`compileNormalizedSubjectResourcesV1`; the original nested copy is removed.
Three pre-extraction WRT/Scene identities remain unchanged. Compiler/Builder
consumer tests pass 50/50, the affected P1.5 exported-medium regression passes
1/1, and typecheck, portable bundle drift and 3C migration pass. The extracted
projection is byte-identical after necessary API/type renaming. Full evidence
and exclusions are recorded in docs/18. C2 is not implemented: Native production
still uses its existing fixed Host closure; this checkpoint does not claim
requested shape/movement selection or real Runtime/visual parity.

C2 execution split (main-agent-only, sequential; input baseline `beae162b`):

| Task | Owner / output contract | Evidence / remaining integration |
| --- | --- | --- |
| CF-12/M-C2A | `scripts/reconstruction/native-subject-host-closure.ts`: given an explicit registered ref or package Subject definition and Host-owned IDs/Camera/gravity, reuse existing Subject schema validation, normalization, resource locking, C1 compilation and core Gameplay/WRT constructors. Return one exact compiled Host closure and its Subject resource cost; no file writes, model call, semantic selection or synthetic Canonical world. | Registered, primitive-composed and rigged inputs; unchanged actual descriptor/profiles; input immutability; invalid/reserved resources and accessor rejection; actual Native generation Request/proxy preparation and changed-definition identities. This constructor does not certify requested movement support or whole-Package budgets. |
| CF-12/M-C2B | Same Native Host owner: activate the source of explicit Subject intent and bind requested modes/primary identity to the selected compiled result; replace the fixed Cloud Ridge closure in production, including full Subject resource budgeting and immutable Request/Attempt/proxy/Package/Capture/resume propagation. | Depends on C2A; old selection/self-check timing and Native ownership must remain explicit. Do not silently select by preset name, substitute G Bot, delete unsupported requested modes, or add an early ordinary-production veto. All current producer/consumer and frozen input changes must close together. |

C2B design-to-definition prerequisite (`CF-12/M-C2B-D`, main-agent-only,
sequential, input `12fb6227`): restore the pinned old compiler's composed Subject
translation at the Native Host owner. Builder design data supplies the complete
primitive/registered-asset silhouette and static/rigged binding, not arbitrary
Gameplay, Physics, Camera, sockets, capabilities or profile overrides. Reuse the
current Authoring visual-part types and validator; do not restore the old Block
World scene language or copy Subject normalization/Runtime compilation. Preserve
the old 1e-9 number quantization, support-center coordinates, included/excluded
collider parts, whitebox appearance, rig/animation/collider refs and exact Host
profile defaults from `9e35ab53:packages/block-world-compiler/src/compile.ts:31-179`.
Output is a PackageSubjectDefinition consumed by C2A, not a second Runtime owner.
Required evidence: source-derived complete-definition parity, all four primitive
shapes, asset transforms, rigged binding, malformed data/accessors, input isolation
and actual compiled closure/proxy. This prerequisite does not activate another
production file or alter frozen Requests. C2B's same-task proposal publication,
checker/proxy timing and immutable output-closure identity transition must be
activated together; never rewrite the pre-dispatch Request to fit later output.

C2B-D evidence checkpoint: the typed converter is implemented. Executing the
actual pinned old translation against the same primitive and rigged designs
produces identical complete canonical definitions; their captured hashes are
regression assertions. Four primitive shapes, exact binding/asset transforms,
malformed data/accessors and input/output isolation are covered. Both designed
closures also pass actual `prepareNativeBlockGenerationTaskV1` preparation.
Generation Request tests pass 55/55 and typecheck passes; no production ingress,
Skill/portable checker, Runtime or existing Host port changed. This is a
prerequisite, not C2B activation or proof of visual/movement parity. The exact
source comparison and exclusions are in docs/18.

### CF-04/R2 recovery timing parity (2026-09-06, input 44897be3 plus current working changes)

Main-agent-only, sequential; depends on the pinned `9e35ab53` SpringArm behavior
and existing Camera Hard Decollider/Director transaction ownership. Exclusive
implementation owner: Babylon SpringArm adapter; consumers: Director and Preview.
No new public fields, Camera owner, query port or ordinary-production gate.

The old arm immediately retracts and recovers linearly on the first clear tick
at the configured `collisionRecoveryMetersPerSecond`. Remove the adapter's
unaccepted 0.12s hold, 0.24s half-life and extra 3m/s cap. Use the existing
Hard Decollider zero-half-life branch; keep V2 final-pose/overlap validation and
all snapshot/reset/rollback state intact. The Camera design section 10.3 records
this narrow parameter-policy amendment instead of leaving conflicting defaults.

Six RED regressions reproduced the mismatch before the adapter change. Afterward,
SpringArm, Preview and generic Hard Decollider test files pass together (54/54),
including profile rates 0/2/6/20, zero/30/60/120Hz-like intervals, translated
non-axis arms, moving/disappearing hits, shortened desired arms, exact replay
after abort, Reset, emergency validation and active-profile transitions.
Root typecheck and diff check pass. No new test file or full-gate checkpoint;
no Browser, model/paid Case or final visual/feel acceptance.

R2 does not close CF-04. Source comparison confirms a second unresolved issue:
the old Director collided the ideal arm before position damping and bypassed
that damping while retracted; current Director damps/transitions the proposed
pose before the final collision query. Thus adapter trace parity alone does not
prove Director recovery/target/transition parity. Next work must reproduce this
at the Director boundary and reconcile the user's old timing with the current
single final collision-safe pose, without copying the old state owner or claiming
the current ordering equivalent. Render interpolation remains separately open.

### CF-04/R3 Director recovery ordering (2026-09-06, same working candidate)

Main-agent-only/sequential; depends on R2. Exclusive owners are CameraDirector
for ideal/smoothed proposals and final Camera, SpringArm for V2 query adaptation,
and existing Hard Decollider for all recovery/last-safe state. No model tasks.
Required evidence is a real Director recurrence RED, same-tick final-path clamp
and rollback, current Havok/Preview/transition regressions and typecheck/3C.

RED reproduced at 30/60/120Hz-like intervals with a slow position-damping
Profile: first 60Hz clear tick produced 0.793568m rather than old 0.85m.
Director now supplies both the full ideal arm and its unconstrained smoothed
position. The adapter solves the ideal arm first and bypasses positional damping
while retracted/recovering. When clear, a distinct smoothed position receives the
same V2 safety query. Hard Decollider records that validated last-safe pose while
retaining nominal recovery state; a final-path obstruction is clamped by the same
owner with zero additional elapsed time. Whole-call rollback includes both
queries. Query count is bounded at two ordinarily and three for final emergency
validation. CameraComponent's existing activeSpringArmState transaction still
captures/restores the same state; no new Snapshot field or owner was introduced.

The 3 Director RED tests pass after implementation. First affected-file run was
69/71: one old assertion required the deliberately replaced position-damped
query endpoint, and one new numeric assertion compared 0.6 to 0.6000000000000001.
The first now asserts ideal-arm placement with unchanged smoothed query/LookAt
target; the second uses distance tolerance and exact actual-state identity.
After final safety/owner tests, four affected Camera/Preview/Havok files pass
73/73; Traversal Runtime's actual Havok file passes 53/53. Root typecheck and
original 3C pass (11 entries / 39 live references / 10 invariants).

This closes the demonstrated double-damping defect, not full CF-04. The current
unified smoothed Target remains; moving-target composition and profile switching
need pinned-old numeric/pixel comparison, and render interpolation still needs
its own decision. No Browser, real model/paid Case, final feel review, aggregate
CI or independent final review was run. All-CF development still precedes Case.

### CF-04/R4 moving-target pose parity (2026-09-06, same working candidate)

Main-agent-only/sequential; depends on R3. Same Director/SpringArm/Hard Decollider
ownership, no external stage or second state owner. `CameraViewSolver` is byte
unchanged against pinned `9e35ab53`. RED at 30/60/120Hz-like intervals showed
independent raw position/target damping was not preserved: current added the
smoothed-target delta to ideal position, then also capped the displayed arm at
nominal length. Both additions are removed; the existing maximum position-lag
Profile parameter still applies normally.

The internal SpringArm request now explicitly carries raw nominal target and
resolved final LookAt. Nominal recovery uses the former; any different final
target/pose receives a real final V2 query, even when retracted. A final clamp is
rebased by the same Hard Decollider to the nominal target anchor for the next
Tick. Last-safe position/anchor and constrained distance remain in existing
transaction state; no extra fields, counters, aliases or ordinary quality gate.
All direct request consumers, including the real Havok fixture, are updated.

Three moving-target RED tests are GREEN. First four-file run passed 77/78; the
remaining fixture assumed the raw nominal target was the Subject's x=10 although
its Profile dead zone resolved x=9.123082. That fixture now explicitly disables
dead zones to isolate target smoothing; no production threshold was changed.
After retracted-final-validation/rollback and nominal-anchor regressions, the
five Camera/Preview/Havok/Traversal files pass together (132/132). Typecheck and
original 3C passed; final check follows only the last test/comment/doc edits.

Next confirmed old behavior, CF-04/R5: pinned-old `CameraComponent.render(alpha,
callback)` temporarily samples a committed render pose buffer, restores the
authoritative pose in finally, and is invoked from Runtime.renderFrame. Current
Runtime calls scene.render directly and CameraComponent has no render history.
Restore that old rendering behavior through current owners, including reset,
rebind, rollback and existing collision-safe requirements; do not treat it as an
optional newly invented smoothing feature. Exact profile-switch comparison and
rendered/feel acceptance remain open. No real model/paid Case has run.

### CF-04/R5 committed Camera render interpolation (2026-09-06, same candidate)

Main-agent-only/sequential; depends on R4. CameraComponent owns only display
history, Director still owns committed Camera state/selection and the V2 query
port, Runtime owns renderFrame. The pinned-old CameraComponent buffer and
render(alpha, callback) are the source, not a new smoothing design. The existing
Subject render buffer lacks LookAt/FOV and is left under its current owner;
Camera vector interpolation uses Babylon Vector3.Lerp, not a generic helper.

The real Runtime fixture reproduced alpha=0 displaying the latest rather than
previous Camera (0.261309m error). Restore previous/current committed position,
target and FOV; wrap renderFrame and restore authoritative Camera in finally,
including when Scene rendering throws. Keep old explicit view/Preview/reset
history invalidation and transaction snapshot/restore. Do not restore the old
render-time zero-delta Director update: current committed-context ownership stays.

Three further RED tests exposed lifecycle gaps in a literal buffer transplant:
duplicate committed ticks consumed a pending reset, while target rebind and
teleport retained stale previous pose. Director now returns a local closed
unchanged/committed/reset result from its actual branches. Component consumes
that result without copying movement logic or storing another transition owner.

Current safety is retained through at most two read-only V2 queries for alpha<1:
the full previous→current position segment and sampled LookAt→actual applied
position. Obstruction/query failure snaps display to committed pose, never fails
production or invokes repair. alpha=1 has no additional query. Installed Babylon
9.23.0 setTarget mutates exactly parallel-Z positions; check the actually applied
position and refresh View Matrix after apply/restore. No copied engine epsilon.
No new Near-plane shape/FOV safety claim is made beyond the existing sphere port.

Evidence: original render RED→GREEN, lifecycle 3 RED→GREEN, Preview plus Subject
pose tests 52/52, then a real Havok obstructed-segment fixture with independently
safe endpoints passed. Final six-file Camera/Preview/pose/Havok/Traversal run
passes 145/145; typecheck, original 3C (11 entries/39 refs/10 invariants) and diff
check pass. No new test file/census change, Browser, model/paid Case, media,
aggregate CI or independent final review. This is focused implementation proof.

CF-04 remains open for exact Profile-switch comparison and final multi-entry
pixel/feel evidence; all-CF code/alignment still precedes the real local Case.

### CF-04/R6 Profile switch trace and final-clamp basis (2026-09-06)

Main-agent-only/sequential; depends on R3/R4/R5, same working candidate. Pinned-old
Director already reset SpringArm on profile/algorithm change, captured the
transition start, and used the new Profile's transitionSeconds. Preserve these
behaviors. Added 3 parameterized tests covering 12 Orbit↔Follow scenarios across
30/60/120Hz-like steps and clear/blocked geometry. Independent old recurrence
checks each Tick's position, LookAt, inner FOV damping and smoothstep transition,
including first transition Tick and completion. All passed without Profile edits.

Audit also reproduced an R3/R4 integration defect: final-path safety used a prior
nominal constrained length from a different spatial basis. RED showed safe final
5m reduced to 2m after a target-origin change, and safe displayed 12m reduced to
nominal 10m after positional lag. The same Hard Decollider now prepares the final
clamp's actual candidate length/reference without advancing time or trusting the
unvalidated candidate as last-safe. Its existing zero-time clamp then projects
the nearest safe point, and existing commit rebases to nominal recovery space.
No second owner, new fields, extra query, timeout or ordinary-production gate.

Evidence: both RED→GREEN; owner input/last-safe/time/rollback adversarial checks;
SpringArm + owner 31/31, then final six Camera/Preview/pose/Havok/Traversal files
151/151. Typecheck and diff check pass. Viewer source confirms animation frames
call render(renderInterpolationAlphaRatio()), which forwards the same alpha to
Runtime.renderFrame; this is source evidence, not a Browser receipt. CF-04 remains
open for multi-entry rendered/pixel/feel acceptance after all CF code/alignment.
No model/paid Case, Browser, media, full CI or independent final review ran.

### CF-04/R7 Native Hosted display scheduling parity (2026-09-07)

Main-agent-only/sequential; depends on R5/R6. The prior Viewer source check did
not cover the actual Native Hosted frame. That frame currently queues fixed
input without awaiting it, renders at the default alpha 1, and retains excess
long-frame backlog. Pinned old `babylon-world-adapter.ts` waits for fixed input,
caps the complete accumulator at five fixed Ticks, uses the 1e-12 boundary
epsilon, and renders the remaining-time alpha. Its first display frame advances
no simulation Tick.

Owner: existing Native Hosted display/input adapter; Runtime remains the only
fixed-input and render-pose owner. Input: display elapsed time and pressed keys.
Output: bounded fixed input followed by Runtime render with remaining-time alpha.
Expose the existing Runtime alpha through the isolated entry, not a new protocol
command, Camera state, timing parameter, gameplay loop or production gate.
Tests must cover long-frame backlog discard, exact-boundary rounding, 120 Hz
sub-Tick alpha, commit-before-render, failed submission, disposal while pending,
and actual Native entry alpha 0/0.5/1 with unchanged committed snapshots. Run
focused consumers, typecheck and 3C migration; full Browser/feel remains a distinct
acceptance layer. R7 does not close all CF-04/12 or authorize an early final Case.

R7 implementation evidence: long-frame backlog and Tick-boundary tests reproduced
0.4166666666666667 excess seconds and a skipped boundary Tick. The actual Native
entry test initially had no camera displacement inside its dead zone; after
warming up 60 fixed Ticks it reproduced alpha=0 rendering the latest camera with
a 0.0399987845m error. The existing entry now forwards alpha to Runtime, and the
Hosted display adapter awaits input before rendering; it neither queues another
frame while pending nor renders after disposal/rejected input. First RAF starts
at zero elapsed time. Five-Tick accumulator cap and 1e-12 epsilon match old code.

Focused entry/frame run passed 24/24; adding 30/60/120Hz cases left the frame
file at 12/12. Typecheck and the unchanged 3C gate (11 entries / 39 live references /
10 invariants) passed. `pnpm verify:hosted-native-browser` passed real dedicated-
origin startup, physical keyboard movement, protocol input and disposal. The
logged Vite /@fs denial is an expected negative isolation probe, not a startup
failure. This Browser run is not a pixel/feel review; alpha 0/0.5/1 and committed
Snapshot invariance are real Babylon/Havok NullEngine evidence. No new model
Case, full CI or independent final review occurred.

### CF-05/S1 Capture startup flight evidence (2026-09-06)

Main-agent-only, sequential; depends on the existing CF-02 watchdog, not on a new
Runtime state owner. Inputs are the existing Browser startup phase/stage/revision
and transient-navigation classification. `capture-startup-watchdog.ts` owns the
bounded immutable error trace and its closed parser; Canonical CLI and Native
Hosted Capture already consume this same watchdog. Hosted cleanup retains the
trace through the existing error cause chain. This is not a Capture receipt,
production success criterion, retry authorization, or a new Runtime snapshot.

Retain the old flight recorder's 200-event default bound, explicitly count dropped
entries, and keep only closed stage/phase/event/outcome enums and numeric progress.
Unknown Browser metadata is omitted from diagnostic projection, never rejected as
a new startup gate. Do not copy URLs, paths, tokens, raw provider errors or old
private Runtime telemetry. Preserve the old 180s/45s/250ms default timings and all
existing transient navigation, terminal error and cleanup behavior. Non-navigation
probe exceptions retain their original identity. Diagnostics use elapsed Host
time only and do not drive fixed input, simulation, Camera, Reset or Replay.

Required evidence: bounded/truncated trace round-trip and negative parser cases,
redaction, two concurrent sessions, immutable caller snapshots, hung/late probe
abort, unchanged success/deadline/retry behavior, and concrete Hosted cleanup with
no resubmit. S1 covers startup failures only. CF-05 remains open for the current
Runtime/Capture running-phase observation source, session-bound durable diagnostic
export and Reset/Replay isolation; do not mark a startup error attachment as the
complete flight recorder. Those later observations remain advisory and must reuse
current committed owners without restoring the old neutral-input recovery path.

#### CF-05/S2 request-bound startup diagnostic persistence

Main-agent-only, sequential after S1. Exclusive owner: existing production Run
Capture port and its immutable JSON publisher. Follow the bounded typed error
cause chain only after formal Request materialization. Persist the parsed S1
trace with Case ref, Attempt index, Host recovery index, formal Request Hash and
WorldPackage root Hash into `capture-startup-diagnostic.json` at the existing
Host output root. Fresh Attempts and `host-recoveries/<index>` must be isolated.
This optional artifact is outside admitted Capture/Package contents and is not
a passed-stage checkpoint or a reason to repeat a model/Capture task.

Reuse existing realpath directory admission and atomic, no-overwrite canonical
publication with mode 0600. Existing different evidence, symlinks, directories
or storage errors leave the original failure code and cleanup outcome intact;
diagnostic absence in those cases is not success and must not be represented as
a new admission failure. Do not serialize the raw Error object or provider data.
Required tests: new artifact's exact identities and redaction, existing-file and
symlink preservation, failing output target, and a real Host checkpoint replay
around mocked Package/Capture owners that writes only the recovery epoch without
resubmitting generation. This is persistence wiring, not real Browser or geometry
acceptance. Runtime running-phase sampling/export and Reset/Replay isolation
remain CF-05 follow-up work; S2 does not close the complete flight recorder.

#### CF-05/S3 Viewer running-phase observation

Main-agent-only, sequential. Existing committed source owners remain RuntimeHost
and BabylonWorldAdapter; the app-owned flight observer receives only a read port.
Read current world-session identity, frames/Ticks, paused state, performance
counts and the adapter's existing closed frame/reset failure codes. Never copy
the old provider's support/failure internals or infer neutral-input recovery.
The observer may report health but cannot pause, reset, render, tick or retry.

Follow pinned-old `runtime-flight-recorder.ts` defaults: 1000ms sampling, 300
samples, 750ms heartbeat delay, 2000ms frame/Tick stalls and below-15 FPS warning.
Retain closed numeric metrics only; omit provider/adapter names, raw errors,
entity names, URLs and positions. A Host-generated diagnostic-session UUID and
an observation epoch distinguish sessions and counter discontinuities. New Host
world-session publication or a regressed frame/Tick begins a new observation
epoch; it is not another simulation/Reset state. Export immutable snapshots and
JSON through a separate read-only app diagnostic surface. Installation failures
are advisory; rollback/page disposal clears the observer timer and its own API.

Evidence: interval/retention/thresholds, closed parser negatives/redaction,
snapshot immutability, concurrent observer/disposal isolation, installation/read
failure containment, and real RuntimeHost with mocked provider ports compared
against an unobserved control through fixed input, Reset and repeated input.
This proves observation does not mutate committed Hash, not rendered/physical
parity. S3 is wired to Playground Viewer, not the separate hosted Native Capture
iframe. Before CF-05 closure, finish that Capture running-phase observation and
bounded durable running-history export using an appropriate shared owner, with
no cross-app private import or duplicate recorder. Real Browser acceptance is
still separate, and no production gate or model task is added by these diagnostics.

#### CF-05/S4 shared observer and Native Capture entry

Main-agent-only, sequential after S3. Move the observer/parser and tests from the
Playground app into `runtime-babylon` beside the existing startup observer;
delete the app-private implementation, update the package export and every
consumer/test-manifest path. No cross-app import, duplicate recorder or alias.
The read source uses provider-neutral numeric inputs, not a Playground type.

Native's capture-only entry is on-demand: `initialSnapshot()` reads the current
RuntimeHost publication and Runtime projection, despite the method name. It does
not expose rendered frame/FPS/triangle/draw-call metrics. Represent these as null,
never fabricated zeros or mesh-count-as-draw-calls. Require `continuous` versus
`on-demand` progress mode in each diagnostic sample. Retain Viewer thresholds
unchanged; waiting for an on-demand request is not a continuous frame/Tick stall.
Heartbeat and actual failure observations remain available in either mode.

Wrap only the original entry's Capture/dispose operations, sample at operation
boundaries, preserve exact payload/error identities, and clear diagnostics before
entry disposal without masking its failure. Diagnostic installation/read errors
cannot prevent Capture. If bridge startup rejects, clean the newly owned entry
and observer while retaining the original bridge failure. Do not add render loops,
simulation calls, retry attempts, wire-protocol fields or production gates.

Required evidence: shared parser/Viewer regression, Native on-demand unavailable
metrics and idle behavior, successful/rejected Capture identity, unavailable
diagnostics, cleanup error identity, existing frame protocol regression, and
the RuntimeHost fixed-input/Reset/repeated-input isolation test after extraction.
Capture running-history retrieval/persistence before Host teardown and durable
Viewer history/export remain follow-up work. Browser acceptance remains separate;
this slice does not close CF-05 or the complete CF goal.

#### CF-05/S5 Capture runtime-history retrieval and Host persistence

Main-agent-only, sequential after S4. The concrete transport retrieves the shared
recorder's JSON from the exact Native iframe before resource teardown. Reuse the
existing startup frame predicate (loopback, frame marker, runtime session, nonce,
formal Request Hash), not a new readiness/admission rule. Collection and sink
completion share one 250ms advisory deadline, reusing the existing watchdog poll
interval; the 120s Capture execution deadline, startup deadlines, cleanup order,
original errors and existing typed transport retry policy remain unchanged.
No sink means the original direct cleanup path. The possible additional teardown
wait is bounded diagnostic overhead, not another Capture attempt or success gate.

Bound browser and Node UTF-8 reads to 256000 bytes, enough for all 300 closed
numeric samples including maximum-width values. Reparse with the shared closed
report parser. Missing/wrong frames, malformed/oversized reports, failed or hung
reads and failed or hung sinks never affect the original result. A read resolving
after the deadline cannot start a sink. An already-started immutable write may
finish after the deadline; no publication or retry decision waits for it.

The existing Run owner forwards the sink through the default Formal Capture
starter. Validate the frozen Request/Package identity and a bounded path-safe
runtime session before writing through the existing immutable JSON publisher.
Use `capture-runtime-diagnostic.<runtimeSessionId>.json` directly under the current
Attempt or Host recovery output root, outside admitted Capture/Package artifacts.
Bind caseRef, attemptIndex, hostRecoveryIndex, both Hashes, runtimeSessionId and
the parsed report. Different allowed transport sessions retain separate files;
do not overwrite an earlier history, follow a symlink, or turn an advisory write
error into business failure. This is not another artifact admission contract.

Required evidence: success and original Capture failure identity, exact-frame
filtering, full 300-sample history, byte/UTF-8 bounds, late/hung reads, hung/failed
sinks, once-only cleanup, optional default-starter forwarding, actual immutable
file permissions/old file/symlink/directory behavior, wrong identity/unsafe ID/
malformed report rejection, and Host recovery isolation without generation
resubmission. Viewer durable history/export and Browser acceptance remain open;
all CF development and old-chain alignment precede the final real local Case.

#### CF-05/S6 Viewer durable history and bundle export

Main-agent-only, sequential after S5; shared observer owns diagnostic history,
Viewer supplies only its stable world identity, optional storage accessor and
Browser event targets. Use the pinned-old recording-world ID selection with the
existing adapter name fallback. Keep one latest report per world and recover it
as the next page observer's immutable previous session, separate from its current
300-sample ring. Preserve old 1000ms sampling, every-five-sample persistence,
immediate persistence for observed error health and Browser error/rejection,
visibility-change sampling and disposal persistence. Never serialize raw Browser
errors, provider detail, inputs or positions. No Runtime state or recovery port.

The current-only storage namespace is `worldkit.runtime-flight.v1.<encodedWorldId>`;
do not revive the old provider-specific report parser or add a legacy fallback.
Use the same 256000-byte report read bound as Capture and the shared closed parser.
Denied localStorage access, read failures, malformed/oversized previous reports,
quota failures and optional event-listener failures leave memory diagnostics and
the world usable. Disposed observers remove their own listeners and timer; a
replaced observer cannot overwrite the new global reader or its stored history.

The reader's `report()`/`exportJson()` remain current-report-only for Capture.
`bundle()`/`exportBundleJson()` export an immutable `runtime-flight-bundle` with
worldId and explicit currentSession/previousSession (null without history). Persist
only the latest report, never recursively nest bundles or accumulate old sessions.
This is advisory export, not a new Package/Runtime/production admission artifact.

Required evidence: exact save cadence, immediate errors and disposal, previous
session/world isolation, bounded retention, stale-observer replacement, visibility
and listener cleanup, denied storage/read/write and corrupt reports, unchanged
Capture report contract, Native no-storage behavior, and RuntimeHost Hash/fixed
input/Reset/replay parity with persistence enabled. Viewer export UI and Browser
acceptance remain follow-up; this slice does not close full CF-05 or any other CF.

#### CF-05/S7 Viewer diagnostic controls and Browser evidence

Main-agent-only, sequential after S6. The Viewer-owned controls bind only shared
diagnostic `mark()`/`bundle()` ports: manual record samples and immediately saves
without touching Runtime, copy presents a redacted numeric summary with the old
manual-prompt fallback on denied clipboard access, and download uses the exact
current/previous bundle. Reuse the existing Viewer JSON downloader with the old
diagnostic 10000ms object-URL release delay; other exports retain their existing
zero-delay default. Do not add a model call, recovery command or publication gate.
This manual record is a diagnostic sample, not a new Gameplay event or a revival
of the old provider-specific free-text event stream.

Show the controls only after successful Gameplay setup; remove listeners/hide
the menu before observer disposal on page rollback/exit. Ignore late clipboard
completion after disposal and keep failures out of Runtime. The expanded menu
must remain above the tuning panel so save/copy/download feedback is readable.

Required evidence: controls+observer regression, exact downloaded report parsing,
clipboard success/failure (use an isolated clipboard sink during automation),
late-callback and disposal cleanup, visible menu/feedback, ready Viewer with real
Babylon/Havok, same-world reload preserving an independent previous session,
and different-world history isolation. Build, typecheck, census and workspace
boundaries are affected checks, not the final repository-wide gate. Local curated
fixtures are Browser verification only; do not call these the final real/model
production Case. Native Capture real-Browser fault/recovery evidence and the
remaining CF acceptance obligations stay explicitly separate.

#### CF-INTEGRATION/TB1 package-owned test inputs and access

Main-agent-only, sequential; input is the eight private-sibling references found
by the existing workspace boundary check after CF-05/S4. Use the Native Profile's
existing root/shapes exports for public types/math and its testing subpath for
checker/layout/session-record test access. Publish the already-existing Capture
test harness through runtime-babylon's testing subpath, not another implementation.
Replace the Runtime Contracts test's dependency on an app-owned JSON artifact with
its own existing Bootstrap data factory, extracted into local test-support without
changing data/helper bodies. Both contract tests consume that same factory; no
production fixture loader, new Registry authority or app import remains.

Required evidence: unchanged fixture data/helper bodies, Bootstrap and directly
affected Native geometry/bounds tests, the Capture harness's direct consumer,
typecheck, unchanged workspace boundary rule and test census. No production
algorithm, gate threshold, Skill or Browser behavior changes. This is existing
verification infrastructure repair, not a new CF production success condition.

### CF-12/M-C2B activation boundary (input b007a2e4)

#### CF-12/20-B1 shared source budget accounting (2026-09-06)

Main-agent-only, sequential; dependencies: the compiled Subject resource-cost
owner and pinned old Block Compiler. The old budget is not the Native static
Collider budget: old `block-world-compiler/src/compile.ts:474-478` derives limits
from source Block count and solid runtime-cluster count; old Compiler usage adds
four foundation vertices/two triangles/one Collider, 24/12 per runtime cluster,
and the compiled Subject cost. Native's 256/65536/131072 admission limits retain
their existing static-Contribution scope and must not be reused as whole-world
limits or increased using the old formula.

B1 extracts the existing Compiler budget predicate as the single reusable owner
without changing Canonical thresholds, diagnostic ordering or inclusive bounds.
The Native production-budget module records the exact old source-accounting
formula with explicit checked Block/cluster counts and compiled Subject cost.
Focused boundary matrices must distinguish merged clusters from source Blocks,
include Subject cost and preserve the old reserves. These values are historical
source-accounting costs, not fabricated Native render/physics measurements.

B2 must establish the actual Native-to-old cluster grouping correspondence before
activating total-budget admission in the Builder feedback/Host chain. Native
palette roles do not uniquely reconstruct all old preset/interaction identities;
do not guess that mapping, use Block count as cluster count, silently substitute
Collider triangle counts, or add a stricter ordinary gate. No speculative budget
gate is activated in B1. Its exported accounting helper must be connected to the
proven B2 producer or removed before the final candidate; B1 is not CF-12/20 closure.

#### CF-19/TOP-OUTLINE advisory raster parity (2026-09-06)

Main-agent-only, sequential; depends on the existing same-task visual renderer
and its frozen delivery. Exclusive scope: renderer top-down outlining, actual PNG
regressions and generated live/frozen renderer bytes. Pinned `9e35ab53`
`scripts/lib/block-world-visual-review.ts` draws top-down edges only when both
projected dimensions are at least four pixels, with `round(baseColor * 0.72)`.
Current Native draws edges unconditionally at 0.70; small distant forms can lose
their interior color under those outlines. Restore the old drawing parameters,
not a new image-quality admission threshold.

Required evidence: actual portable renderer PNGs for large and sub-four-pixel
full Blocks and quarter Blocks with only one small dimension in either rotation;
preserved entry PNG golden, adjusted top-down golden and repeat determinism;
source rebuild/live-frozen drift, affected Host replay consumers and typecheck.
Do not alter world geometry, display gap, palette/identity, Camera, grouping,
repair/model budget or generation protocol. Native per-Block and old greedy
cluster geometry still differ; this raster correction does not establish cluster,
complete projection or actual model-effect parity. Final Case remains deferred.

Implemented and measured through actual portable-renderer PNGs: the four cases
first failed with the old Native outline RGB, then passed with the pinned drawing
rule. The existing entry RGBA hash remains
`sha256:ec9a8b77f1ece977738a1e360fe99df4f6145f94016415f4bd6eace728300e6b`;
the corrected top-down golden is
`sha256:ab02b1e2dd3b942a8613fbab5e808ab601275b454974333b67b9c4708fb9caf6`.
The generated renderer and representative frozen copy were rebuilt/synchronized.
Affected `pnpm check:native-block-builder-skill -t ... --maxWorkers 1` tests
passed 9/9 (68 unaffected cases skipped), including a fresh source rebuild, exact
live/frozen bytes, repeated outputs, Camera-only entry changes and captured-layout
identity. Native Package positive and RGBA/renderer-tampering negatives passed
3/3 through the actual Host replay. Typecheck and diff checks passed. No Browser,
model/paid Case or full repository gate ran; these are deterministic advisory
pixels and Host integration, not generated-world quality or Runtime pixel parity.

#### CF-12/19 REGISTERED-PROXY advisory parity (2026-09-06)

Main-agent-only, sequential after SUBJECT-PRIORITY/TOP-OUTLINE; exclusive owner:
`native-block-subject-visual-review-proxy.ts` and its existing Request/portable
renderer consumers. Pinned old `scripts/lib/agent-authoring-catalog.ts` rotates
registered Subject extents in XYZ order, but scales/translates the source-bound
center without rotating it. Native had applied the full Runtime YXZ transform
to the offset as well. This changes the comparison image used to tune framing;
even the G Bot's Z center changed sign. Restore the old registered advisory
approximation with Babylon quaternion/vector operations, not Runtime transforms.
Package-composed proxies retain their existing implementation; this slice makes
no claim about full composed-proxy or rendered Runtime equivalence.

Required evidence: literal old G Bot proxy RED/GREEN; asymmetric translation,
scale and simultaneous XYZ rotations executed against the pinned old function;
compiled Runtime transform unchanged; all historical admitted catalog rows and
proxy parts compared; real portable PNG against an independent old cuboid;
existing portable rebuild/frozen drift and actual Host pixel replay. Catalog,
Request/checker/renderer hashes follow the changed input, with no identity bypass
or additional production gate. Rebuild and sync both affected frozen tools.

The live catalog comparison finds all 22 historical admitted Subjects' selection
fields and modes retained, and the same seven rejected refs. Current Registry
adds `humanoid.alpha-local-actions@1`; no historical entry was replaced by it.
The old admitted list itself has only ground-walk executability. Retaining typed
unsupported movement is parity, not a requirement to invent new flight/vehicle
capabilities. Full CF-12 original Subject/Camera/identity acceptance stays open.

Checkpoint evidence: G Bot literal bounds first failed, then passed; Request/
Subject closure suite 67/67; all 28 old registered proxy parts compare with zero
coordinate delta. Native tool subset 6/6 includes the actual registered PNG
versus independent old cuboid, unchanged composed goldens, renderer rebuild and
frozen copies. All four portable tools rebuild byte-identically (1/1). Actual
Host Package publication, RGBA tampering and frozen-renderer drift tests 3/3;
typecheck and diff checks pass. No model, new Browser run or paid Case. Earlier
MEM1-BROWSER results retain their original input identity, not this later tree.

#### CF-12/SUBJECT-PRIORITY generation instruction parity (2026-09-06)

Main-agent-only, sequential; depends on the existing admitted Subject catalog,
controlledSubject compiler and same-task Camera tuning. Exclusive ownership is
the live/frozen Native Builder Skill, output-contract guidance and actual Host
task instruction. No parser, Registry, Runtime, renderer or production gate change.

Pinned old `9e35ab53` Block Builder Skill and `references/subject-camera.md`
explicitly prioritize the complete ordered movement set and body topology,
then a complete registered Subject, then Camera tuning. Appearance likeness is
not a whitebox requirement; ordinary human clothes/weapons do not justify a
primitive rebuild. Compose only for a necessary locomotion/body-topology whole
without a suitable registered representation, keeping its major masses and scale.
The Native instruction instead said to reconstruct the complete reference shape,
without the registered-before-composed priority or appearance-stage boundary.

Restore the old decision order at the actual frozen delivery points. Keep the
admitted catalog and all requested movement checks, necessary compositions and
normal error behavior; never substitute a fixed G Bot for a missing/invalid
selection. This is generation guidance, not a new automatic composition/likeness
veto. Clarify that the existing ban on selecting resource refs in the Camera
instruction concerns Camera refs, not the explicitly required Subject choice.

Required evidence: inspect both old instruction sources; live/representative
frozen copies byte-identical; actual preparation copies these same inputs;
existing Subject admission/composition/movement and full Native Skill checks.
Instruction delivery does not prove a generated model followed it. Comparable
real scene reconstruction remains part of the final Case after all CF development
and alignment, not a reason to launch another model during this edit.

Evidence: full `pnpm check:native-block-builder-skill` 73/73; preparation file
11/11, followed by the directly affected PNG/WebP delivery pair 2/2 after the
Camera-ref wording clarification. Existing checks cover the actual frozen Skill
copy and admitted/rejected Subject and movement behavior. The skill-creator Python
quick validator could not import PyYAML; the existing Node YAML parser validated
frontmatter/name/allowed keys and absence of scaffold placeholders instead.
Diff checks passed. No automatic semantic-wording test or new decision gate was
added, and no real model, Browser, full CI or generation-quality claim was made.

Sequencing follows the user's scope clarification: prioritize the generation
instructions, parameters, geography, Subject/Camera and world-detail budget.
Report old supporting workflow migration and new Native diagnostic/strict
adaptations separately; neither is automatically evidence of reconstruction
quality or authorization for another ordinary production gate. This changes
work order and reporting, not the full CF completion scope.

#### CF-13/J1 strict blocker acceptance-target join (2026-09-06)

Main-agent-only, sequential. Owner: the existing NBR strict verifier and its
production-integrity diagnostic adapter; no Runtime, Case/Builder schema,
Capture generation or ordinary production gate changes. Dependencies: the
already frozen Case collider identities and verified materializer visual groups.

The verifier previously projected Case blockers down to colliderId and discarded
contributionId/acceptanceTargetRef. Retain those fields through the same private
input contract, require the Native contribution identity, and join the formal
traversal check's acceptanceTargetRef to the Case blocker target, following the
existing Case traversal-to-Collider-role rule. Separately retain the block-plane
source visual group to Collider geometry join. Never require that visual group's
acceptanceTargetRef to equal the Collider acceptance target: the latter may be a
Collider-only obligation with no semantic silhouette row. The first J1 draft
conflated these domains; the valid Collider-only Case regression corrects that
overconstraint before closure. Multiple Collider IDs can share one target, but each
must retain its exact Case/contribution/formal join. No blockers means no invented
block check; duplicate/missing joins and unmeasured declared blockers still fail
strict acceptance. Production-integrity continues to record the existing typed
diagnostic without veto, with historical/terminal ownership unchanged.

Focused evidence: ID-preserving target mismatch RED/GREEN, Case contribution
mismatch, empty blocker set, two Collider IDs sharing a target, strict versus
ordinary/historical behavior and the full direct verifier consumer tests/typecheck.
This does not complete CF-13's generic Case/check derivation. Pinned old landmark
presets are static solid; do not delete all landmark Collider expectations merely
to make strict acceptance pass. Frozen explicit blocker intent, unreachable
backgrounds, approach paths and source-authored generic checks still need closure
with CF-11, without new ordinary gates or model stages. Final real Case remains
after all CF implementation and alignment.

#### CF-20/C32 Native chunk candidate measurement (2026-09-06)

Main-agent-only, sequential. Depends on the existing chunk-policy/optimization
owner and CF-20/R1 synthetic workload. Exclusive implementation scope: Host
candidate list and the existing budget verifier; no Runtime policy override,
Builder DSL, ordinary admission gate or production default change.

The pinned old chunk edge is 32m, but old ownership uses Block centers at origin
zero and then greedy X/Z/Y merging by preset/shape/effective size/visual and
interaction identity. Native owns whole extents at origin `[-0.5,-0.5]`. The
32m Native candidate is therefore a measurement input, not a legacy cluster
mapping. Boundary probes must preserve straddling blocks. The current 4m policy
and hash remain fixed; a 128m visual-only macro span demonstrates why the five
small Corpus cases alone cannot establish a large-world optimum.

The existing 2k/8k/16k workload captures its real finalized admission epoch and
feeds the single deterministic chunk benchmark owner. Its measurement report
includes every 2/4/8/16/32m candidate and separately identifies the current Runtime
policy. Candidate comparison CPU work is excluded from the existing admission
timing field; Runtime rebuilds the same module without an epoch observer. Keep
pending real-Case slots unresolved. Projected draw units/residency occupancy are
not actual frame draw calls, old merged-cluster costs or alternative-policy
Browser/Havok measurements. Existing Browser timing still measures current 4m.

Required evidence: chunk boundaries and original Corpus selection, actual 2k
admission/Package-to-report identity, larger synthetic layout counts, direct
optimization/materializer/collider consumers, typecheck, test census, package
boundaries and renderer bundle drift. This is focused development verification,
not the final full-gate checkpoint. Full Browser/Havok/Capture policy sweep and
B2 grouping/whole-world budget alignment remain open before CF-20 closure.

#### CF-20/MEM1 Block allocation snapshot retention (2026-09-06)

Main-agent-only, sequential after C32 exposed the 16k Node heap failure. Owner:
Native Profile Session allocation/rollback, not Runtime physics or resource
admission. `allocate()` snapshots the current Scene meshes for partial-allocation
cleanup. Its long-lived disposer captured the same lexical environment as the
filter reading that snapshot, retaining every previous Set for the session's
lifetime (quadratic references). Isolated Node GC/WeakRef instrumentation proves
64 of 64 sets stay reachable while the 64 Blocks and session remain alive.

Register the successful Mesh disposer in the caller's per-iteration scope,
outside `allocate()`. Keep dynamic `mesh.dispose()` lookup, reverse acquisition
order, partial-allocation cleanup, reserved-cell release and primary failure
identity. Do not delete the rollback snapshots, bind a stale dispose function,
increase the heap/Block budget or skip any geometry/ground admission work.

Evidence: isolated retention RED/GREEN (zero retained snapshots, all Blocks still
alive, all disposed later), full Session rollback/failure suite, identical 8k
profile/Package identities before and after the fix, the previously failing 16k
synthetic admission, portable checker/renderer drift and typecheck. Synthetic
16k success alone must not change the 8k production ceiling or replace the
missing Browser/Havok/Capture/old-budget parity evidence.

#### CF-20/DISPLAY-PARITY current-only fixed rendering (2026-09-06)

Main-agent-only, sequential; owners: fixed Profile display/identity, Session
finalize, portable advisory renderer and Package replay. Pinned `9e35ab53`
`runtime-babylon/src/scene-geometry.ts:101-220` expands logical clusters back to
individual thin instances at uniform `0.985` scale. It does not render each
cluster as one large box. The old software review instead draws full-metric
greedy cluster cuboids (`scripts/lib/block-world-visual-review.ts:60-78`). Keep
this deliberate distinction; neither represents a new scene or collision owner.

Remove Native's configurable absolute `displayGapMeters` and three competing
defaults (`0.04m`); Session finalize now contains only explicit static Collider
selections. One pure Profile constant owns Runtime `0.985`; checked metric
geometry stays unchanged, Profile inventory Hash binds the fixed display ratio,
and Package verifies the captured fixed ratio. No old gap alias or fallback is
retained. Existing historical real Cases/receipts are immutable and cannot be
presented as revalidated against the changed contract. Regenerate current tools
and the representative frozen Skill, not historical run inputs.

Portable preview clusters already-validated Native Blocks by center-owned 32m
chunk, palette role, visual identity, shape and effective size, then uses the
old X/Z/Y expansion order and full bounds. Palette partitions are for advisory
color, never an inferred old physics preset/interaction identity or total-budget
producer. Native quarter-meter treads use the existing eighth-meter center key;
they are not claimed as an old shape. Direct execution of the pinned old cluster,
shape and chunk code agrees for 64 plain-preset fixtures across four old shapes,
four rotations and origins -33/-1/0/31, including holes and visual partitions.
This closes neither CF-20/B2 runtime accounting nor the 8k world-capacity gap.

Required evidence: five shape-ratio RED/GREEN cases, retained no-override/fixed
geometry/Collider checks, projected volume invariants and actual portable PNGs,
Package source/ratio identity negatives, typecheck, Skill drift and affected
Browser capture. Broader final CI and real first/second Cases remain open.

Checkpoint (2026-09-06): the Profile suite reported 265 passing and two stale
capture-isolation scale expectations; after updating those expected scales to
0.985, all four capture-isolation tests pass. The Builder suite reported 84
passing and one old PNG golden; the corrected golden/captured-identity selection
passes 3/3. After the final portable checker rebuild and representative-copy
sync, byte identity and relocated standalone type checking pass 2/2. Typecheck
passes. The Package/settlement run reported 43 passing and one 60-second timeout
in the mock-versus-checked layout regression; that unchanged test passes alone
in 32.56 seconds. This is combined focused evidence, not a new all-green frozen
aggregate run. No timeout or production threshold was increased.

With MEM2 removed, the 8k Browser report
`output/playwright/native-block-budget-1788692636951/8000.json` records actual
Runtime readiness in 13.42 seconds, 1,106,652,196 JS heap bytes, 8,159 Geometry
objects and supported state at tick 90. The opening screenshot was inspected.
Its tracked diff identity is
`sha256:a811d4e31d402071385c13bb86c76123cf49717765812e7226f19287cd5ebf24`.
This remains a synthetic current-policy workload, not first-Case acceptance or
old-capacity equivalence. The semantic-geometry fixture previously used zero
display gap; removing that override invalidates its old pixel-relation Browser
evidence. Rerun actual captures with the fixed old scale, without changing the
Runtime scale or production measurement thresholds to preserve test pixels.

Browser closure: six actual synthetic Check/Ground/Package/Capture/Evaluation
runs complete with all cleanup. The first seven-claim comparison correctly
failed: the rear fixture's upper row was visible through one restored seam at
opening pixel (833,244), rather than fully occluded (28,464 vs 28,463 pixels).
Retain that failure in `output/playwright/cf-display-parity-20260906/pixel-claims.json`.
Remove only the test fixture's second rear row, leaving the front wall, scale,
Cameras, bounds policy, Colliders and all seven assertions unchanged. The
fixture suite passes 12/12; only this invalidated rear Capture was rerun at
temporary verification snapshot `a8d6f084b9ad45fa826357afb59ceb7e0ab5d6f0`.
All production execution files remain byte-identical to snapshot `80e5118a`;
the snapshot delta contains only the fixture and its unit expectation.

The final `output/playwright/cf-display-parity-20260906/pixel-claims-fixed-fixture.json`
passes 7/7 exact target-pixel claims. It retains all six evidence roots, actual
PNG/receipt hashes and Camera signatures. Rear opening is bit-for-bit equal to
the solid baseline (28,463 pixels); side grows 14,700 -> 29,400 and top grows
4,800 -> 9,600. The final rear side image was inspected. No production pixel
threshold, mask rule or gate changed. This closes the display-change Browser
regression, not CF-20/B2, full-world capacity or formal reference-Case acceptance.

#### CF-12/14-SUBJECT-CSP browser import closure (2026-09-06)

Main-agent-only, sequential; depends on the existing CF-12 Subject design schema
and CF-14 production Capture. Owners: Authoring's Subject validator generation,
its browser-safe subpath and the Native authoring-manifest consumer. The first
DISPLAY-PARITY formal capture was blocked by the uncommitted implementation
identity; an isolated committed copy with all 2,261 selected files and zero
execution-byte differences then passed Check/Ground/Package but failed loading
the shell. A diagnostic-only page listener identified Ajv2020/new Function
violating the unchanged Hosted CSP. The Native manifest imported the Authoring
root barrel, eagerly evaluating Host-only schema compilation in the browser.

Use the existing standalone-Ajv generation pattern for both existing Subject
schemas, preserving formats, strict/allErrors settings, diagnostics and allowed
override checks. Node and browser use the same generated functions; the Native
consumer selects the closed Subject subpath, not the whole Authoring barrel.
Do not add unsafe-eval, bypass the SDK identity check, change Subject admission,
invent a second schema/parser or classify synthetic capture as a real Case.
Evidence: actual Profile import with string code generation disabled first RED,
then the directly affected Profile boundary, Authoring and manifest suites pass
80/80. Generation drift and typecheck also pass. Direct comparison with the
pre-fix validator at isolated snapshot `28be9203462519a018b5afc8e73c47a5986c87ea`
passes 396 full-result comparisons, including diagnostic details, across valid
and malformed registered/composed/Definition inputs. This is equivalence to the
existing Subject admission, not a claim that all CF behavior matches legacy.
Rebuilt live/frozen tools pass the byte-copy, relocated checker and actual source
admission selection (3/3), with unchanged advisory PNG/captured-identity goldens
(2/2). Direct Subject compilation consumers pass 8/8. The clean verification
snapshot `80e5118ab6998354b58a9b1b669f558371ab1fb2` has 2,264 selected files and
zero execution-byte differences from the CF checkout. Its uninstrumented
`verify:native-no-script-capture --semantic-geometry solid-wall` completes the
real Check/Ground/Package/Hosted Capture/Evaluation flow and all cleanup. The
opening PNG was inspected; evidence is
`/var/folders/xh/89vqy8ts02b11h7tddrr0m7h0000gn/T/worldkit-no-script-capture-evidence-nIKmxV`,
Package root `sha256:bfb60f1d71af9d4c0d0d0e0845415f2a634470328803bd828ed0bec94ff89386`.
This closes the discovered CSP startup defect, not the full CF-12/14 work,
semantic pixel comparison, real first/second Cases or final full-gate checkpoint.
The temporary verification repository's commits do not advance the CF branch.

#### CF-20/MEM2 experiment withdrawn (2026-09-06)

The same-shape Geometry cache was tested, then removed rather than promoted as
legacy parity. Its 8k Browser report at
`output/playwright/native-block-budget-1788691161635/8000.json` preserved Profile
and Package hashes but differed in 88,589 decoded pixels. Babylon 9.23.0
`thinInstanceMesh.pure.js` installs matrix/color vertex buffers on Geometry;
sharing across authoring sources also shared those batch buffers. Unit resource
and per-vertex color tests missed that rendered boundary. Geometry counts fell
8,159 -> 161 but measured JS heap only changed 1,104,522,176 -> 1,084,869,048 bytes;
Runtime-ready time was 12.67s -> 23.08s in non-isolated host runs, not a speedup
claim. Do not accept or cite this experiment as visual/capacity equivalence.
The cache, its snapshot sharing and copy-on-write display changes were removed;
the already verified MEM1 closure-retention fix remains. No budget was increased.

#### CF-20/MEM1-BROWSER measured follow-up (2026-09-06)

Main-agent-only; the existing synthetic benchmark now completes both 8k and 16k
through actual Babylon/Havok, 90 fixed ticks and an opening screenshot. Reports:
`output/playwright/native-block-budget-1788682157860/8000.json` and
`output/playwright/native-block-budget-1788681929192/16000.json`. Both bind HEAD
`44897be3fe205316d01f16637e0878e936410178` and tracked diff
`sha256:23dda6540531b5f2a98dfe6ed8c21be662e7eaceb080ef37d09f5747ce50733d`.
The benchmark hashes the full Git diff as a stream: generated bundles exceeded
the previous synchronous child-process buffer before any workload started.
Independent `git diff HEAD -- . | shasum -a 256` matched the recorded identity;
no truncation, timeout relaxation, workload change or extra production gate.

8k/16k Runtime-ready time is 12.67s/37.95s; post-measurement JS heap is
1,104,522,176/2,970,627,920 bytes, not peak RSS. Both end supported at tick 90
without safe fallback. Their profile/Package identities match the corresponding
MEM1 Node measurements. Chromium 151.0.7922.34 uses SwiftShader: render-plus-
`gl.finish()` samples are software-renderer measurements, not hardware FPS or
reference-scene quality evidence. The older 16k page crash is historical, not
the current result. Keep the 8k production ceiling and current 4m chunk policy;
successful 16k initialization does not establish safe general production limits.

Per the user's direction, defer performance optimization and further sweeps;
continue scene-generation fidelity first. The remaining original CF-20 budget
and representation obligations are not deleted. No model/paid production Case
ran; final real Case remains after all CF development and alignment.

#### CF-11/GP4 authored exploration list order (2026-09-06)

Main-agent-only, sequential after GP3. The shared materializer intent parser
owns authoring/metadata/portable admission; Ground and Host consume that same
intent. Pinned old `9e35ab53:packages/block-world/src/check.ts:767-824` checks
target/band IDs for duplicates but retains arbitrary input list order. Current
Native adds lexicographic-order vetoes to both source-authored lists. Remove
only those vetoes, retaining explicit unique stable IDs and the original list
order through immutable metadata and Hashes. Do not silently sort input,
waypoints or frozen Case rows, or relax sorted derived materializer inventories,
visual groups, resource refs, duplicate positions, entry/policy or geometry checks.

Required evidence: independent target/band order RED cases, retained duplicate
ID negatives, immutable round trip and order-sensitive Hash, actual portable
checker and Host Package propagation, typecheck and rebuilt frozen tools. Update
the live/frozen Skill guidance narrowly through skill-creator, without new outputs,
stages or wording-only tests. This removes an old-absent ordinary gate and does
not close the full CF-11 geography/Runtime/real-Case obligations.

Checkpoint: reversing target order and band order independently reproduces two
old-absent sorted-input failures; duplicate-ID negatives remain rejected. The
shared parser now checks uniqueness without sorting, preserving list/waypoint
order, immutable round trips and order-sensitive metadata Hash. Parser/Ground/
authoring-manifest files pass 100/100; typecheck passes. The actual portable
source-authored/optional-policy selection passes 2/2 using non-alphabetical target
and band lists. Host Package optional-island and curved-exploration tests pass
2/2 with exact metadata order, unchanged frozen Case/Request bytes, and retained
unsupported/disconnected negatives. Four checker bundles rebuild exactly (1/1),
Native checker/renderer frozen copies match, both Skill quick validators and diff
check pass. Skill edits only remove the two unsupported ordering instructions;
other canonical inventory/ref ordering remains untouched. No new model/paid Case,
Browser or full repository gate ran. Full parent-task acceptance remains open.

#### CF-11/GP3 optional target connectivity parity (2026-09-06)

Main-agent-only, sequential after GP1 and BAND-DIRECTION. Exclusive owner:
Native Ground target evaluation and its existing Host Package consumers. Pinned
old `9e35ab53:packages/block-world/src/check.ts` emits target-unreachable only
when `requireSingleReachableComponent` is true. Native currently applies the
boolean to whole-component failure but still rejects each disconnected target,
forcing optional/mixed-ground geography to grow an unrequested ground route.

Use that existing boolean for target reachability and its step-frontier repair
facts, after unchanged support/clearance/topology evaluation and reachability
measurement. Do not change the graph, Source/Case shapes, policy derivation,
actual movement capability, budgets, or any explicit traversal-band requirement.
The target stays in the report and remains measured as unreachable; false does
not turn an unreachable target into a reachable one. Keep all-ground rejection.
Required evidence: RED disconnected standable target with false policy, retained
true-policy target/component/frontier failures, false-policy unsupported/blocked
target and broken explicit-band negatives, real Host Package false-policy target
binding with immutable Case/Request bytes, directly affected portable rebuild.
This removes an extra ordinary veto; it is not a new gate or full CF-11 closure.

Checkpoint: optional disconnected target, forced step-frontier repair and the
extra target error beside an explicit broken band first fail (3 RED, 4 retained
negatives/true-policy checks pass). After the owner correction, Ground's full
file passes 32/32 and typecheck passes. Actual Host Package regression passes
1/1 with two authored targets, one genuinely reachable, unchanged Case/Request
bytes and retained target metadata. Portable source/optional-policy consumers
pass 2/2; all four checker tools rebuild exactly 1/1. Native checker/renderer are
regenerated and byte-equal to their frozen copies, with live/frozen instruction
bytes unchanged in this slice. Diff check passes. No movement owner, Skill
instruction, model/paid Case, Browser or full repository gate changes/runs.

#### CF-11/BAND-DIRECTION source intent parity (2026-09-06)

Main-agent-only, sequential after GP1/GP2. Pinned old `block-world/src/check.ts`
accepts explicit `isBidirectional` on authored ground bands: forward traversal
always, reverse only when true. Restore that boolean in the current source-authored
sidecar parser, immutable metadata and Host Ground input. No optional fallback:
update live/frozen instructions, current producers and fixtures together. Existing
case-defined inputs retain their bidirectional meaning; the Host supplies true,
not a guessed sidecar override or a change to frozen Case coordinates.

Ground uses the same neighbor graph and honest-width reachability owner for both
directions. This is a required-check direction, not a claim that geometry becomes
one-way, not activation of directed transitions or a new movement capability.
False never skips forward reachability, waypoint support, clearance, Spawn or
single-component checks. Old guidance defaults authors to true except when the
Brief explicitly describes one-way traversal. No new files, gates or task stages.

Required evidence: current parser rejects both old boolean values (RED), then
preserves them and their metadata/Package hashes; missing/nonboolean/accessor
negatives; affected Ground/Host/portable consumers and frozen rebuilds. Preserve
case-defined behavior and do not mutate historical runs. Full CF-11 and actual
directed-motion support are not implied by this source-intent restoration.

Checkpoint: both explicit boolean values reproduced the prior closed-field
rejection (2/2 RED). The final parser/Ground/manifest/Capture/semantic consumer
selection passes 126/126, no-script evaluation binding 1/1 and typecheck pass.
Portable Native selection passes 7/7, including the shared source parser,
257-anchor fixture, renderer rebuild and frozen-copy checks. Actual Host Package
curved exploration (including a false band and unsupported/disconnected negatives)
and atomic Layout publication pass 2/2. All four portable tools rebuild byte-for-
byte (1/1). Live/frozen Skill quick validation also passes after the authorized
user-local PyYAML installation; repository dependencies are unchanged. No model,
paid production Case, new Browser run or full repository gate ran in this slice.

#### CF-11-GP2 exploration count parity (2026-09-06)

Main-agent-only, sequential after GP1. Existing owners: materializer intent parser
and Native Ground analyzer. Old `9e35ab53:packages/block-world/src/check.ts:171-253,
765-822` validates every anchor without a target-count ceiling; its 256 limit
applies only to waypoints in one band. Current parser and Ground each add an
independent 256-anchor veto. Remove only those target-count assertions after
257-anchor RED reproducers. Keep sorted unique identity/position, exact Spawn,
per-band 2-256 waypoints, actual support/connectivity and existing resource budgets.
Evidence: parser and actual Ground 257-anchor positive, unsupported last anchor
negative, retained band maximum, portable bundle/frozen drift and typecheck.
No new count budget, fallback, stage or real Case; this does not close CF-11.

#### CF-11/12-GP1 frozen ground-policy admission (2026-09-06)

Main-agent-only, sequential; depends on M-A/B ordered modes and existing Host
Case policy. Owners: existing Case preparation/validation and the sole
runtime-contracts ground-exploration parser/admitter;
direct consumers: task self-check, authoring binding, Host Package and Ground.
Old `9e35ab53:agent-block-builder-self-check.ts:242-300` requires middle/remote and
Spawn-to-middle evidence only for connected ground-only intent. The current
parser incorrectly imposes those minima on every source-authored proposal.
Separate unconditional row validity from this already frozen Case policy; pass
the existing `requireSingleReachableComponent` explicitly at all admission calls.
Case derivation also incorrectly hard-coded true and Case validation rejected
false. Derive the boolean from the actual Brief's ordered modes, using the same
parsed byte snapshot for the Palette semantic Hash; replace the derivation
helper's caller-supplied semantic Hash with those bytes. Palette labels are not
a second movement authority. Preserve case-defined policy and ground-Spawn
support checks; false source-authored policy alone does not skip Ground.
No new persisted field, parser alias, policy default, model stage or Runtime
motion capability. Declared rows still retain unique identity/position, non-Spawn
targets, valid bands and actual Ground checks even when the lists may be empty.

Required evidence: optional-evidence RED-to-GREEN, ground-only missing-role/band
negatives, invalid declared rows under both policies, same exact authored intent
through self-check/Host binding/Ground, portable bundle and live/frozen Skill
drift, directly affected package/contract tests and typecheck. Preserve all current
unsupported movement diagnostics; allowing optional ground evidence does not make
the current ground-walk-only catalog implement flight or swimming. This batch
does not close full CF-11/12 or authorize the final real Case.

Execution is main-agent-only and sequential. Preserve the same three declared
source outputs and same Builder task/self-repair counter. `scene.ts` never owns
the controlled Subject. The existing `native-block-authoring.json` is the pure
data proposal surface, alongside its existing opening Camera intent. Host-owned
subject compilation, not a Native Block Session, resolves the selected design.

| Task | Owner and dependency | Required integrated result |
| --- | --- | --- |
| C2B-S | Authoring Subject design schema/parser/types; Native authoring consumer. Depends on C2B-D. | One closed registered/composed design, reusing current Subject part/shape definitions. A composed proposal cannot supply executable profiles, sockets, capabilities or Runtime state. The Host converter consumes this same type; no independent script-only schema or field aliases. |
| C2B-H | Reconstruction preparation/self-check/Package; depends on S. | Freeze only known input policy/identities before dispatch. Resolve the Subject from the output proposal with the same compiler in task self-check and Host replay; bind the resulting WRT/Gameplay/locks and proxy to exact output bytes. Delete the Cloud Ridge closure read and old preselected WRT/proxy input assumptions together. Keep the immutable Native Bootstrap world/ref/seed/Spawn input; do not rewrite it or a Request after model delivery. |
| C2B-R | Run/journal/repair/checkpoint/Capture; depends on H. | Separate upstream immutable policy identity from generated Subject closure identity. Resume the same source/Request without a model POST; reject stale outputs under the existing integrity contract. Subject geometry, budget cost, Camera target and Capture all consume the one compiled closure. |
| C2B-G | Compiler/Traversal lock and direct Native Ground/Runtime consumers; depends on H, main-agent-only/sequential. | Preserve the actual normalized Capsule from a profile or derive policy. Replace flat named-profile-only provenance with one closed colliderSource union in the existing Lock/Envelope. Canonical and Native use the same Subject/resource lock compiler; no shape reverse scan, fabricated Profile, geometry re-derivation or skipped Ground. Required evidence: real composed Native Package RED-to-GREEN, registered parity, exact derivation lock/shape and forged-source negatives, Havok/Reset, affected consumer/hash fixtures and typecheck. |
| C2B-I | Builder Skill/checker/catalog/context fixtures and generated copies; integrates S/H/R/G. | The same task selects/assembles the whole Subject, inspects the newly derived proxy and uses compiled executable modes/envelope. Retain pinned-old defaults, parameters, repair order and no new ordinary quality gate. Contract/consumer tests, focused Native Skill drift, typecheck and affected Host/3C checks precede the final all-CF Case. |
| C2B-M | Same-task checker and Host Package, depends on H/G and M-A/B; main-agent-only/sequential. | Restore the exact old catalog capability-to-mode mapping after actual selected Subject compilation. Check every ordered Brief mode; composed remains ground-walk only. One shared helper supplies bounded missing-mode diagnostics to the existing checker/Host replay, never an early Planner/dispatch veto. Required evidence: registered/composed false-pass RED, all eight intent modes, real frozen-input Package rejection and valid composed Package, diagnostic propagation, portable drift and typecheck. |
| C2B-C | Host resource context/catalog and the existing task/Package selection helper; depends on H/M, main-agent-only/sequential. | Restore old Hosted registered ordinary-human admission without restricting SDK fixtures or composed designs. Provide compiler-derived admitted/rejected catalog rows in the existing immutable context before Builder dispatch; preserve actual mode/Collider/Camera/proxy data and bind it to the same frozen Registry. No new file, model stage, Runtime owner or automatic Subject choice. Required evidence: primitive-proxy false-pass RED, rigged/composed/non-human positives, all discoverable refs accounted for, compile-derived row identity, forged catalog rejected, Package replay, diagnostic propagation and live/frozen Skill drift. |

S is not an alternative ingress or permission to accept ignored Subject data.
The Native source field must be required when H/R/I activate; do not add a
missing-proposal G Bot fallback or publish a tree as production-ready while an
accepted proposal still has no consumer. The final input/output freeze transition
must update the affected frozen Skill wording and its exact copies together.

C2B-M source evidence (2026-09-06): pinned `9e35ab53` already rejects missing
movement modes in `agent-block-builder-self-check.ts:220-241`. Its catalog
mapping requires exact capability refs after compile admission; composed uses
only ground-walk. Underwater/custom have no mapping. The current resolver now
derives the same mode list from the output-selected compiled closure and frozen
Registry; task self-check and Host Package use the same ordered comparison.
Brief bytes/semantic identity and Subject output/Registry hashes retain their
existing owners; no new model stage, source output, repair cycle or Runtime state.
This does not complete catalog parity: the old catalog also excludes registered
ordinary human/biped primitive proxies unless asset-backed and rigged. That
Hosted-only availability rule and exposing useful admitted catalog information
to the Builder still need closure; Runtime fixture compilation must not be
globally restricted to solve the Hosted policy. Full CF-12 and Camera remain open.

C2B-C implementation checkpoint (2026-09-06, same uncommitted candidate): the
Hosted-only registered human/biped asset+rigged rule now shares one selection
helper between same-task self-check and Package replay; lower-level SDK fixture
compilation remains valid, and composed/non-human designs are not excluded.
The existing frozen context carries a recomputed admitted/rejected catalog with
real compiled mode/Collider/Camera/proxy data. All 30 current discoverable refs
are accounted for (23 admitted, 7 rejected). One bounded cache stores canonical
catalog bytes keyed by all Registry resource hashes, never caller-owned objects;
dependency changes invalidate it, and returned mutations cannot affect another
context. This restores pre-dispatch catalog information, not a new selection
stage, request file, model task, automatic default or Runtime authority. Detailed
non-aggregate verification and the five fixed timeout regressions are in docs/18.

S source audit also identifies a separate existing legacy authoring policy:
`9e35ab53:packages/block-world/src/check.ts:88-119,591-608` limits composed
Subjects to 1–48 parts, unique part IDs matching `[a-z0-9][a-z0-9-]{2,79}`,
nonempty trimmed display/description, semantic class `[a-z0-9][a-z0-9.-]{2,95}`,
and nonempty part tags matching `[a-z0-9][a-z0-9.-]{1,63}`. Ordinary primitive-only
human/biped visual height is 1.6–2.1 m with the old `1e-8` tolerance; its asset
parts may not exceed 1.25 scale on any axis. These are old checker behaviors,
not newly invented gates. The shared Authoring Subject schema has a wider
1–128 part representation ceiling and is not this Profile's complete policy.
The Host design constructor now applies this legacy policy before composed
definition translation/normalization. I must connect that same constructor in
the existing task-level check/Host replay,
not promote it to a pre-Planner or pre-Builder veto or infer movement support
from it. The earlier two fixture definition hashes prove the converter only;
those fixtures' dotted part IDs do not prove old checker admission. No old
full-Subject-check or full production parity claim follows from those hashes.

S/Host entry checkpoint: `SubjectDesignV1` and `ComposedSubjectDesignV1` now
belong to Authoring; the former script-local design type is deleted. The closed
registered/composed schema references the existing Subject field schemas and is
available through `@whitebox-world/authoring/subject-design-schema`. The same
validator is consumed by the composed translator and
`compileNativeSubjectHostClosureFromDesignV1`; exact registered lookup and
composed Host compilation share the existing C2A owner, never a fallback.
The Host design entry applies the above old policy. Directly executing the
pinned old checker helpers and original composed-scale branch produces the same
diagnostic classifications on 28 cases (18 accepted, 10 rejected), including
count, identity, height/scale tolerance and primitive rotation branches. This is
policy parity, not full Native admission, requested-mode support or Runtime pixels.

The two actual designed Request-preparation fixtures use old-admissible hyphenated
part IDs; the independent converter golden fixtures keep their earlier dotted IDs
and limited conversion-only meaning. Existing generation Request/Attempt and
production freeze code still has not switched to output-selected Subjects. The
Native authoring field and Skill are intentionally not advertised as usable until
H/R/I consume them together. No fourth output, schema fallback or new model task
has been activated.

C2A implementation checkpoint: the explicit Host constructor and shared Subject
projection exist. Actual Native Request/proxy preparation accepts registered
asset, registered primitive, package primitive and package rigged closures.
The proxy's former global-Registry-only assumption is removed for package refs;
package Definition hash/lock and all existing asset checks remain. Registry
visual comparison uses the normalized projection, preserving existing lock and
visual comparison roles without an added normalized-Definition-hash gate.
C1 inputs now require only consumed Subject/Anchor data, not Canonical placement
provenance. Compiler/Request tests pass 89/89 before the final added cases; the
10 new/strengthened cases and original Package-owner regression 1/1 pass, with
typecheck, portable drift and 3C migration passing. The same eight pre-existing
workspace-boundary violations remain. Detailed non-aggregate evidence is in
docs/18. C2B remains unimplemented: the production runner still reads the fixed
Cloud Ridge Host closure, and no requested-movement or final Case success is claimed.

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

#### CF16-STUDIO-INTERRUPTED-VISUAL-DELIVERY

Main-agent-only, sequential; depends on CF16-STUDIO-VISUAL-RETRY and
CF16-LOCAL-DELIVERY. Studio records visual-only resume in its existing
evaluation-run. On restart, preserve the ordinary old freshness path. Only an
interrupted explicit visual resume may use the existing visual owner to replay
an already delivered task when that path is insufficient. The replay must
validate the original request, frozen input/Skill bytes and delivered outputs,
run the same Host finalizers, and never dispatch a model or Cloud reconciliation.
Unknown/undelivered work stays interrupted for explicit reconciliation.

No second parser, finalizer, quality reviewer, new task or production gate.
Native whitebox closure, Run/Attempt and passing pixels remain unchanged.
Required evidence: complete old-timestamp delivery, partial promotion, local and
Cloud completed delivery, absent/foreign/mutated delivery, changed input, repeated
restart, original whitebox hashes, no dispatch; ordinary stale placeholders and
explicit failures remain rejected. Real Case remains deferred until all CF work.

Implementation checkpoint: Studio writes `executionMode: visual-resume` to the
existing evaluation-run. If ordinary fresh-output recovery fails, only that
interrupted mode can call `replayDeliveredStyledVisualAgent`. This reuses the
original owner with a dispatch callback that always rejects; local retained
delivery may be restored, while an unknown Cloud task cannot be reconciled or
submitted automatically. Original receipt/hash checks and finalizers remain
the owners. Focused visual entry 46/46 and Studio recovery 13/13 passed;
typecheck/syntax/diff passed, no real model generation.

Remaining CF16 recovery parity: pinned `9e35ab53` Studio also classifies late
visual delivery after particular terminal failures and Host finalization shell
errors (`recoverGeneratedStyledOutputs` and
`isRecoverableVisualFinalizationFailure`). Its recovery call sites extend beyond
startup. Current Studio's recovery is startup-only and broadly rejects failed
records. Before closing CF16, compare the exact failure classes and invocation
timing, map them to the current typed owner without restoring old error aliases,
and prove that completed delivery is recovered without new POST while explicit
visual/alignment failure remains failure. This is existing CF16 work, not a new
production gate or a new main CF task.

#### CF16-LATE-DELIVERY-PARITY

Main-agent-only, sequential after interrupted-delivery replay. Studio owns the
existing recovery classification and record transaction; visual owner retains
request/delivery validation and finalization. Restore old 60s default / 1s
minimum recovery polling and initial reconciliation, with one in-flight sweep,
active/queued/cancelled exclusion and shutdown cleanup. Serialize recovery with
user retry on the existing per-record executor. Map old exit -1/1 late-delivery
and Host finalization failures to current Native failure codes, excluding
explicit visual/alignment failure; do not revive removed provider state aliases.

First close already-local delivered bytes (including Host partial promotion).
Remote completed output retrieval is still required separately through the
existing router's exact request/job owner; never describe local replay as Cloud
retrieval, submit a new POST, or copy old credential/routing code into Studio.
Required evidence: complete/incomplete late delivery, finalizer replay,
alignment and cancellation rejection, normal exit classification, unchanged
whitebox, timer no-overlap/cleanup, active/queued isolation, recovery/retry race.

CF16-CLOUD-RECONCILE-ONLY (main-agent-only, sequential; depends on the local
late-delivery slice) now connects the same visual owner to the generic router.
The owner verifies the original visual request, inputs, Skill and frozen dispatch
arguments before invoking the retained Cloud request with `--reconcile-only
--reconcile-no-wait`. The additional switches are administrative, not new model
parameters, attempt identities or production gates. The router alone resolves
the exact request/attempt and verifies/downloads declared outputs; Studio does
not parse provider IDs, copy credentials or issue model POSTs.

The existing same-id helper defaults to its original wait behavior. The paired
no-wait switch only makes a background sweep return on a nonterminal lookup,
without a terminal failure receipt or replacement submission. This preserves the
old Studio's repeated completed-delivery checks instead of blocking a sweep for
the ordinary one-hour task poll. Missing original journals never submit a task.
Disabling automatic recovery still permits already-local restart finalization,
but disables remote reconciliation. Original input/dispatch Hashes, finalizers,
whitebox publication, retry budgets and model timeout settings are unchanged.

Studio shutdown aborts the active recovery before waiting. The visual owner
reuses the existing owned-process implementation, moved byte-for-byte from
`apps/studio/src/owned-process.mjs` to `scripts/lib/owned-process.mjs`; the public
server now imports that same owner. Its TERM grace and KILL escalation are
unchanged, including cleanup of descendants after their immediate parent exits.
There is no app-private implementation import from the visual script, duplicate
process owner or compatibility re-export. Abort is checked before dispatch,
finalization and promotion; Studio cannot publish a ready record after shutdown.

Evidence must distinguish real local child/router/finalizer execution with fake
remote service/adapter fixtures from actual Cloud/model or rendered acceptance.
Those latter acceptance layers remain open until all CF implementation and
old-branch alignment finish, followed by the final local production Case.

#### CF16-FULL-INTERRUPTION-RECOVERY (2026-09-06)

Main-agent-only, sequential; depends on CF16-CLOUD-RECONCILE-ONLY. Exclusive
scope is Studio's existing recovery eligibility and its integration fixtures.
The pinned old `9e35ab53` `recoverLateLwdpCodexDelivery` accepts interrupted
Cloud runs independently of an explicit resume mode, retrieves the original
visual delivery, and replays Host finalization. The current Native eligibility
incorrectly stops an interrupted `executionMode: full` before that same-owner
replay when live styled artifacts are incomplete or older than this run.

Restore that entry for automatic Cloud recovery, including startup's retained
running record. Keep original request/attempt/input/Skill/delivery verification
in the visual owner; Studio never submits a model task or accepts old pixels on
mtime alone. Automatic recovery disabled, cancelled records, stale run/Capture,
explicit alignment failure, active/queued isolation and retry serialization
retain their current behavior. No new provider aliases, retry policy or gate.

Required evidence: RED for an interrupted full run with an incomplete Host
promotion; GREEN for completed, old-pixel, initially pending and startup-running
deliveries; cancellation/stale evidence negatives; unchanged original attempt
and formal Capture bytes, zero model dispatch. Run the affected Studio recovery
and retry fixtures plus the real visual owner's request/delivery replay tests.
This does not replace actual Cloud/model, Browser or final production acceptance.

Implemented: the full-delivery fixture first stayed `interrupted` instead of
`ready` (RED). Removing the unintended resume-mode prerequisite for automatic
interrupted/running Cloud recovery makes the same fixture pass. Studio
recovery/retry matrix 34/34 and polling/freshness/explicit-failure checks 7/7
passed. The old-pixels positive was then isolated from missing-report recovery:
all reports remain present and only PNG mtimes are old; that revised case passed
1/1. With automatic recovery disabled, the existing stale-pixel negative still
does not replay or pass. The actual visual owner suite passed 50/50, covering
retained delivery identities, exact original reconciliation arguments, real Host
finalizers, partial promotion and no replacement submission through local/fake
Cloud adapters. Syntax and diff checks passed. No model/paid Case or full CI ran.

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

CF16-RECORDING-TRANSPORT implementation contract:

- The existing origin/source/session/nonce bootstrap transfers Runtime port 0
  unchanged plus media port 1 only when both interactive endpoints enable
  recording. Formal Capture and verifier routes do not install the media port
  or controls. No extra global-message listener or Runtime schema alternative.
- The Native browser adapter creates the shared CanvasRecorder lazily against
  the actual hosted Runtime Canvas. Shell owns the controls, save callback and
  download; no Studio id, API URI, credential or generated scene instruction
  crosses the media channel. Runtime snapshots and deterministic requests are
  not media metadata or truth sources.
- Closed start/stop requests use increasing request ids. After stop, preserve
  the original Blob, duration and MIME; shell pulls one exact-offset chunk of
  at most 64 KiB at a time, and frame releases the Blob after the last chunk.
  This bounds each transfer and in-flight chunk count, not whole-clip retained
  memory. Whole recording remains in memory as in the old recorder; no new
  duration/size gate is added. Existing Studio upload size policy remains its
  owner and will still require the original local-download failure path.
- The media channel is tied to bridge/frame disposal and navigation. Invalid
  media packets close recording without changing ordinary production outcome;
  explicit Runtime close disposes media before Runtime. Preserve old
  `9e35ab53:apps/playground/src/main.ts` recording-reset conflict behavior.
  Closing the channel rejects pending operations and stops shell timers.
- Standalone Native shell currently downloads via the same extracted download
  implementation as Canonical (filename policy, original Blob, 10s URL release).
  This is not a replacement for CF16-RECORDING-STUDIO-BINDING: exact Package/
  Studio identity, automatic upload, shared workbench installation and upload
  failure backup remain open. No new provider/model request is made here.

#### CF16-RECORDING-STUDIO-BINDING implementation (2026-09-06)

Main-agent-only, sequential; depends on the completed media transport. Studio
owns a managed recording-preview launcher and its lifecycle. This uses the
existing owned Package copy and Native dual-origin server, not a replacement
Canonical Preview or a changed generated launch command/BNA receipt. Concurrent
opens share one launch; changed Package, shutdown and server exit revoke its
scene-scoped capability and dispose only the owned server/copy.

Only the trusted shell Node process receives the explicit local Studio origin
and capability. Runtime receives neither, browser defines contain only scene id
and Package root. The shell middleware proxies the exact existing recording and
scene-media endpoints, strips cookies/global authorization, and adds its private
capability. Studio resolves the current existing published Native launch proof
for authorization and passes the resulting identity through a private request
context, not an untrusted header. Shell CSP allows same-origin media/images;
Runtime CSP, credentialless/sandbox policy and deterministic protocol remain
unchanged.

The shell compares its trusted context to Runtime ready Package identity before
installing the existing shared workbench. Stop uploads the original result once;
upload failure retains the old original-Blob download backup, filename policy
and 10s URL release. Standalone Native still downloads locally. Disposal stops
the shared panel polling and suppresses late downloads. The Studio action
explicitly prepares a page/link; opening it never submits a generation task.

Native recording source metadata retains its Package root. Upload completion,
generation admission/queue execution and bundle preparation verify that the
recording is still paired with that Package. Historical raw video remains
downloadable from Studio. This is the Native fixed-source identity boundary,
not an additional visual/media quality threshold or ordinary production gate.
Canonical normalization, prompt/reference order, provider parameters, retries
and success predicates are unchanged.

Focused evidence covers stale authorization/Package, upload/transcode races,
queued Package replacement before generation, concurrent opens, natural exit,
shutdown during launch, exact proxy bytes, no credential forwarding, shell-only
media policy, original upload/download fallback and teardown. Browser action
tests use explicit single POST and fake DOM; encoding/page interaction still
require actual Browser acceptance. No real model/paid Case was run. The later
CF16-FULL-INTERRUPTION-RECOVERY checkpoint closes the automatic recovery entry
and focused old-timestamp replay coverage; actual Cloud recovery and full
visual/media acceptance, together with the other CF work, remain open.

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

### Latest trial outcome and CF-19/ID1 (2026-09-06 20:20 CST)

The latest user scheduling supersedes the previous merge condition: after this real Case
completes production and necessary integration checks, merge the candidate into main, then
branch from that main to continue the remaining CF scope. A second reference image belongs
to that follow-up branch and is no longer a prerequisite for this merge. No incomplete CF
item becomes complete merely because production succeeds.

The fixed `fda2ced35e97f957126ca6619aa093615ac2eeb2` local run is now terminal:
`paper-moon-054-cf-trial-fda2ced-0906/runs/run-20260906120237-85763`.
Planner task `planner-20260906-115054-85778`, self-check, Host replay and directory promotion
passed. Builder completed with exit 0 after 1,009,828 ms. Native Check rejected with
`WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID`; production exit 1, not published, cleanup
completed, Ground/Capture/Evaluation not run. The original receipts and generated source
remain immutable. Advisory images still omit major terrain/valley mass; CF-11/20/21 fidelity
is unresolved independently of the structural failure.

CF-19/ID1 is main-agent-only and sequential. Its bounded ownership is the existing Profile
identifier predicate, session use, advisory renderer feedback, their tests and frozen tools.
Pinned old `9e35ab53:packages/block-world/src/check.ts:30` and the current session use the
same 3-80-character lowercase/digit/hyphen ID rule. The generated coordinate-to-ID helper
emits `middle-gate-pillar-n7-p2.5`; the renderer previously accepted it. Share the actual Host
predicate instead of copying another regex, changing geometry, weakening admission, or
adding a task/retry/ordinary gate. Invalid group IDs use the same existing contract.

Evidence so far: the three new renderer cases were RED (Block and Collider group IDs
incorrectly exited 0; visual group reached a later generic undeclared-group diagnostic).
The repair passes 18 ID/boundary/escaped-feedback cases and typecheck. A private replay at
`/tmp/worldkit-cf19-id-replay.g3wOZ2` rejects the exact ID before emitting comparisons; both
its source and the original have SHA-256
`fa8f69da0cf782ddaa2ca8d31b4504c2a5ada9f090e39a5b53647af86e1fb76d`.
This is diagnostic feedback evidence, not a successful production replay. Full affected
Profile/session/package-boundary/Builder Skill regressions subsequently passed 153/153.

Integration preflight refreshed remote main to `0d7662791355337020230eb6d34084b158839dcf`.
The simulated merge has two test-only conflicts: semantically equivalent viewRequirements
fixture formatting and main's 120-second renderer-build test timeout. Preserve main's CI
fixes when the success condition is met; do not alter the in-flight/source-pinned trial or
another task's checkout. No merge or PR has been performed.

### CF-19/INPUT2: shared authoring-input grammar (2026-09-06)

Depends on ID1; main-agent-only, sequential. Exclusive ownership is Profile pure input
parsing, the existing advisory consumer, focused tests and frozen Builder tools. Twelve
new regressions reproduced broader drift: unknown fields, explicit null/undefined,
short grid prefixes, Collider selection branches/ratios and canonical repeat finalization.
The Host's existing parser is extracted unchanged in acceptance semantics; the feedback
consumer calls that owner instead of retaining a second parser. Invalid ID diagnostics
now name and safely bound the field value. No new production gate, retry or task is added.

The feedback VM declares its ordinary Object/Array prototypes before source execution;
the Host still accepts only its own ordinary realm. Accessors and custom prototypes are
not coerced. Successful normalization and grid ordering are identical; grid duplicate-ID
preflight leaves no partial batch; repeated equal canonical finalization is idempotent.
Collider geometry admission, membership, Ground, Runtime and capacity remain with their
existing owners, not the disposable comparison renderer.

Evidence: 12 regression cases RED before wiring; renderer input/ID 16/16 GREEN; grid
atomicity and post-finalization 4/4; realm/adversarial/Profile/actual Host Session 79/79;
typecheck passed. The generated renderer/self-check and representative frozen copies
are synchronized. Full affected five-file regression passed 199/199 in 263.36 seconds,
including the Builder Skill drift gate and Collider settlement. Current shared-parser
feedback replay of the unchanged private source again rejects the exact decimal ID before
PNG output. This is not a final full-CI checkpoint or independent review.
The original failed 054 Run remains failed and immutable;
no fresh real Case has been launched and the main merge condition remains unmet.

### CF-20/CLUSTER: close feedback-to-Runtime volume representation

Current baseline is 13f31012; pinned comparison remains 9e35ab53. Main-agent-only,
sequential; no subagents or paid Case at this implementation checkpoint.

| ID | Dependencies / exclusive owner | Contract and integration | Required evidence |
| --- | --- | --- | --- |
| CF-20/CLUSTER1 | Existing advisory cluster algorithm; Profile pure geometry owner | Move the existing X/Z/Y greedy, center-owned 32m visual partition into the Profile; advisory imports that single owner. Delete the script-local implementation and alias. Preserve source membership, effective shape, palette and visual identity, and every output bound. This does not assert a physics-preset mapping. | Existing asymmetric/negative-boundary/identity/quarter-tread fixtures, package exports, unchanged decoded pixels and frozen portable tool drift. |
| CF-20/CLUSTER2 | CLUSTER1; Host visual materializer and live-handle/Capture consumers | Actual Runtime display must realize the cluster cuboid and apply fixed 0.985 shrink to that whole cuboid, not independently to each member Block. Keep all logical Block IDs and exact semantic selection/tint/hide behavior, one registry and deterministic realization hash. Migrate all live-handle consumers together; do not silently merge separately addressable identities or let selecting one member tint unrelated geometry. Collider/ground/topology remain their existing metric owners. | Failing two-adjacent-Block volume reproducer, actual Babylon world vertices/instance counts, asymmetric and chunk-crossing layouts, semantic isolation and restoration, partial-failure disposal, real rendered comparisons before claiming equivalence. |
| CF-20/CLUSTER3 | CLUSTER2 plus actual resource measurements and B2 semantic grouping proof | Reconcile the fixed 8k production limit against old source/cluster accounting. Preserve the distinction between actual Native workload, old accounting and static-Contribution limits. Do not manufacture cluster counts from source count or merely raise a number; no extra ordinary gate. | Complete-world workloads above the present 8k floor/terrain limit, all actual downstream budget consumers, and later full production/reference-image evidence. |

Static evidence: old block-world-compiler/src/clusters.ts keys by preset/effective
shape/visual identity and keeps interactive/stateful Blocks independent. Current
pre-fix visual-batch-materializer.ts created one matrix per Block even though advisory
already projects merged cuboids. Matching the 0.985 scalar therefore does not prove
the same visible union or source capacity. This is a remaining representation gap,
not a successful CF-20 completion or an exemption from the full goal.

CLUSTER1 is implemented in the uncommitted tree: the script-local implementation
and alias are deleted; the advisory consumer imports Profile visual-clusters.ts.
Four existing geometry cases, the fixed decoded-pixel comparison, and typecheck
pass. CLUSTER2's real Babylon reproducer went RED then GREEN: for two adjacent
1m Blocks, the displayed minimum X is now -0.485m rather than
-0.4925000071525574m, with one display volume and both logical IDs retained.
Runtime now consumes the shared cluster plan, with independently owned unit-cube
Geometry per batch and one matrix per cluster. The realization hash binds normal
cluster matrices and complete source membership. Capture uses explicit per-member
display transforms only for temporary partial-cluster selection, restores normal
matrix/color buffers on exit or partial setup failure, and verifies the complete
logical-ID-to-instance membership without scene-name inference. Collider and
ground owners are unchanged; physical residency remains 4m while visual partition
is 32m. The diagnostic physical-chunk benchmark now recommends 2m under its
unchanged tie-breaker, but this is not applied as a Runtime policy change.

Direct regression passed 138/138 before additional adversarial fixtures;
subsequent Capture tests passed 6/6 and materializer/package-boundary tests 20/20.
Typecheck passed. The existing real Browser/Havok 2,000-Block workload completed
90 fixed ticks (60 retained timing samples), Runtime ready in 3220.6ms, and an
inspected opening PNG at `output/playwright/native-block-budget-1788700639877/`.
Its source diff hash is
`sha256:b8b51183e424af410b28082d28603390883ec6ce8e66239e0ad329845d3b3069`.
This is synthetic Runtime/render evidence, not an old/new pixel comparison or a
successful reference-image production Case; retained authoring Meshes still
contribute to memory. Regenerated live/frozen tools are byte-identical. Final
directly affected regression passed 254/254 in 11 files (278.02s), including the
complete existing Native Block Builder Skill drift gate, materializer, Capture,
identity, measurement, chunk benchmark, optimization and package-boundary tests.
Diff checks passed. No root full CI or independent exact-SHA review is claimed.

CLUSTER3 remains open; the source budget B1 helper is still not authorized to
produce a speculative production veto. This implementation checkpoint is ready
for its focused branch commit, not a main merge. Full CF effect, capacity and
final real-Case evidence remain required.

CLUSTER3 consumer audit (same implementation checkpoint): the 8,000 source cap
is published in `native-block-production-budget.ts` to both Planner context and
the generation Request. Request parsing requires a positive `maximumBlockCount`;
Profile Session reserve and grid expansion enforce it. The advisory executor
repeats that budget and additionally has a fixed 100,000 capture ceiling. Ground
analysis derives occupancy/support budgets from the requested maximum, not the
checked source inventory. These are distinct consumers; changing one production
number would not close the chain. Pinned old `clusters.ts`, Block checks and
Builder self-check have no corresponding fixed source-count gate; old compile
derives resource limits from source/solid-cluster counts. Continue by removing or
replacing the mismatched count contract consistently, using actual checked
inventory for derived work bounds, not an arbitrarily enlarged numeric cap.
Preserve existing Native trust/Collider ownership and output/process limits;
do not claim old resource equivalence from visual cluster counts alone.

#### CLUSTER3/COUNT current-only source-count contract removal

Baseline e8f7de07, main-agent-only, sequential. COUNT1 owns the Profile Session
and shared input parser: remove the caller-defined Block cap and budget argument;
retain exact input grammar, deterministic grid expansion, overlap preflight and
atomic allocation/rollback. COUNT2 depends on COUNT1 and owns Generation Request,
Planner budget context, advisory execution and Ground consumers: delete the fixed
source count from current request schemas and the advisory-only 100k cap; derive
Ground work bounds from checked layout Blocks, not an untrusted/request maximum.
COUNT3 owns migration of all direct callers, portable type graph, live/frozen Skill,
fixtures and affected hashes. Remove the obsolete source-count rejection corpus;
retain all independent malformed-input, occupancy, Collider and resource negatives.

Evidence: RED no-budget Session plus production budget shape, beyond-8k actual
Profile allocation and shared Host/VM grammar, Ground integration, strict current
Request parsing (old count field rejected rather than ignored), full directly
affected typecheck/Skill drift and frozen bytes. Existing process/output/Native
Collider safety limits are not changed here. Complete-world capacity, old total
resource-accounting correspondence and final image production remain open after
this count-contract repair; no newly invented gate or infinity/large-number alias.

COUNT implementation evidence: both initial reproductions failed (missing Session
budget and the published 8,000 property), then the actual 8,100-Block allocation
and the four-file Profile/corpus/budget regression passed 92/92. Six further
Request/generation/settlement/workload files passed 148/148. Current-only Request
parsing explicitly rejects the removed field. The rebuilt advisory tool captured
8,104 Blocks (8,100 slab plus four fixture Blocks) and emitted the normal PNGs in
the focused execution test; it is not a geometry-quality judgment. Five real
Host integration tests passed (32 unrelated tests skipped, 243.25s): no-script
Requests, checked complete bounds, optional Ground evidence and curved exploration
including unsupported/disconnected negatives. Typecheck and Skill quick_validate
passed; live/frozen Skill and tools are synchronized. Complete portable-tool and
remaining direct source-admission regression passed 172/172 across six files
(486.41s), including Planner context freezing, Native dual replay, Package input
and live Collider registration. A final strengthened slab replay asserted the
actual 8,104 captured count and passed again (one selected test). Final typecheck,
diff checks and frozen byte comparisons passed. COUNT1–3 implementation closure
is ready for the focused branch commit; this is not root full CI, an independent
review or final real-Case acceptance.

Package budget ownership was also checked directly: native-package-input.ts
assertContributionWorldFacts and babylon-native-isolated-runtime-entry.ts count
static Contribution Collider vertices/triangles, not visual Block Mesh vertices.
Those limits are not an undiscovered replacement source-count gate; do not widen
or reclassify them as whole-world render limits. B2 total resource correspondence,
other representation limits and final full reference-image production remain open.
