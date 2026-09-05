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
target tri-views: same-task opening self-review/Host closure first, then tri-views consuming that exact
accepted styled opening and semantic directions. This is the checkpoint for paper/material/appearance
comparison. A raw Block capture must never be compared as though it were the old styled final image.
It does not require ten variants, six videos per variant, or the full Episode.

CF-26B Cloud retries, CF-31C Host-only recovery, full CF-13/NBR strict acceptance, full multi-mode CF-12,
general per-view CF-14/24 and full feature-scoring CF-21, inspector/performance polish, and Episode/media
remain recorded but are not unconditional first-rerun blockers. If a new 054 Planner output actually
triggers omitted target identity or another one of these direct input defects, fix the demonstrated
blocking slice before Builder; never bypass it or silently drop the target.
