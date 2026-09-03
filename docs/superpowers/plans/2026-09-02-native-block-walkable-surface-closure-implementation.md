# Native Block V2 Capability Migration and Walkable Surface Closure Implementation Plan

**Design:** [Native Block V2 Capability Migration and Walkable Surface Closure](../specs/2026-09-02-native-block-walkable-surface-closure-design.md)
**Stable task:** `NBR-65`
**Baseline:** `origin/main@9a4639109e4d161d92297506e9fc92192d32ff44`
**Evidence branches:** `origin/codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05`; supplemental production evidence at `origin/codex/block-world-main-integration@8c250b5fc2181b48947d95b12fac03333bf11e5f` and `origin/codex/block-world-main-integration@d69d7f821f10328bc02dac3a83218f924e754780`

**2026-09-03 accepted execution clarification:** NBR-65C is consumed by the
existing Native Package owner after the in-memory Package root is verified and
before the Package directory is published. Checked Build-Epoch ground evidence
stays Host-only; the ground report and diagnostics are Attempt artifacts rather
than new WorldPackage fields. NBR-65H parity `passed` rows bind a closed focused
gate command and zero exit code; token presence alone is insufficient.

**2026-09-04 production-loop correction:** the migration is not complete while
the Native Builder lacks the frozen Planner images or a quality-measurement miss
can erase an otherwise admitted world. NBR-65J closes that causal-feedback and
preview boundary before the real Case is accepted. It ports v2 behavior without
restoring its Three renderer, Manifest, Compiler or hidden foundation.

## Delivery graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / input -> output | Required evidence | Mode |
|---|---|---|---|---|---|---|
| NBR-65A | Freeze the complete v2 capability ledger and current-only Group API | BWB-2, BWB-4, BWB-6 | 65B..65I | Profile spec/types/Skill; v2 evidence + current contracts -> one authoring API and deletion ledger | type fixtures, docs truth, public export census | main-agent-only |
| NBR-65B | Freeze one identity-bound logical ground model | 65A | 65C..65I | Block Profile Host seam; checked Layout + explicit Groups -> canonical occupied/support inventory | asymmetry, holes, cross-group, order and replay tests | sequential |
| NBR-65D | Build one continuous visible/Havok walkable topology and exact solid union | 65B | 65C, 65E..65I | Profile materializer; ground model -> identity-bound topology/proxies | mixed height, seams, holes, triangle determinism and budgets | sequential |
| NBR-65C | Add Subject-relative standability, connectivity and exploration evidence over the final topology | 65B, 65D | 65E..65I | Host analysis only; ground model + final topology + resolved Subject + Case intent -> stable report | footprint, clearance, exact topology height, Spawn, target, component, band and metric tests | sequential |
| NBR-65E | Reproduce slope/step movement and add ground-only exposed-edge protection | 65D | 65F..65I | Native contribution, Package and runtime-babylon; exact topology -> SDK-owned Havok behavior | installed-engine audit, real Havok, masks, jump, reset and cleanup | main-agent-only |
| NBR-65F | Realize Profile batching, far visibility and bounded collision residency | 65D, 65E | 65G..65I | Profile visual adapter + existing Runtime lifecycle; BWB-6 assessment -> actual batches/Chunks | draw/resource counts, Capture identity, seam traversal, residency lifecycle | main-agent-only |
| NBR-65G | Align whitebox lighting/materials and current Skills | 65D, 65F | 65H, 65I | Runtime light owner, Profile display adapter, live/copied Builder Skill | material/light tests, Skill parity and negative ownership census | sequential |
| NBR-65H | Atomically migrate every active consumer and add a v2 parity verifier | 65C..65G | 65I | fixtures, Corpus, generated Module, Package metadata and verifier | no old field/fallback; per-capability current-code evidence | sequential |
| NBR-65J | Restore v2 production-loop usability parity under current Native owners | 65G, 65H | 65I, NBR-70 | Case/Profile, generation task, Formal Capture and production result; named Planner images + admitted Package -> bounded feedback + preview-safe terminal disposition | input identity, incomplete traversal, report-only/strict disposition, launch and cleanup tests | main-agent-only |
| NBR-65I | Run the real Case, publish evidence, review and merge | 65H, 65J | NBR-70 | one Case root plus status/review; reference -> Package/Runtime/Capture/parity Receipt | focused gates, Browser play, exact-SHA Mode B/runtime review | main-agent-only |

The shared contract path is sequential. Tests for a frozen producer can be prepared while its consumer
is implemented, but no worker independently changes Runtime state ownership, Package identity or the
final integration tree.

## NBR-65A: current-only API and deletion ledger

1. Add RED type tests for optional `colliderGroupId` on `createBlock()` and
   `createBlockGrid()`, plus the closed `colliderGeometrySource` union.
2. Make `staticColliders[].blockId` invalid. Do not support both shapes through overloads, aliases,
   parser fallbacks or migration adapters.
3. Freeze `exposedEdgePolicy` and reject it for non-static-surface selections.
4. Preserve stable logical Collider IDs even when Host realization later creates multiple Chunk parts.
5. Update the live Builder Skill and every frozen Skill copy in one checkpoint.
6. Add a repository census for the removed selection shape, Three adapter imports, Block Manifest,
   Block Compiler, hidden foundation and Scene-scan collision inference.

Focused evidence: Profile API/type/session tests, Skill source/copy tests and clean-break census.

## NBR-65B: canonical logical ground model

1. Add one package-local pure module that consumes only a passed checked Layout and parsed Group
   selections.
2. Expand the existing occupied microcell inventory without reading Mesh/tag/material/name state.
3. Record sorted source Block, Collider Group, visual group, traversal binding and cell identities.
4. Derive `declaredTraversalSurfaceProfileRefs`, global exposed support-top candidates and solid
   occupancy from the explicit selections once; do not accept a caller-owned list that falsely
   claims Subject support. Package/Runtime admission resolves the locked profiles and controlled
   Subject compatibility later.
5. Bind canonical bytes and hash to Build Epoch, checked Layout inventory, Profile inventory and
   Native Scene Bootstrap. Join the Subject traversal envelope, Case intent and Package root only in
   the later Ground Analysis Report, so source/profile topology identity has no circular Runtime or
   Package dependency.
6. Reject empty/duplicate groups, one Block in multiple Collider Groups, mixed incompatible binding,
   cross-Session membership, missing source identities and accessor-bearing input.

Focused evidence: pure ground-model tests, session rollback, Host evidence hash and replay tests.

## NBR-65C: checker and actionable diagnostics

1. Port the algorithms, not the v2 package: footprint-union coverage, vertical clearance,
   actual source-Block top-center samples, shared-edge source-surface step adjacency, BFS
   components, target reachability and bounded traversal bands. Retain microcell samples for dense
   continuous surfaces, but never omit a one-meter Block center merely because it lies on a
   microcell boundary.
2. Evaluate the exact registered Spawn and explicit band endpoints; never choose a nearby support
   sample or visual-group center on their behalf. Require at least one band to start at Spawn, every
   band to bind a passing target, and a one-to-one binding between bands and ground pass targets.
   Put traversal-to-Collider legality in the public Case parser only: require unique Collider,
   Contribution and checkpoint IDs; bind Spawn support and its Collider to one acceptance target;
   require `pass -> ground|step` and `block -> blocker`; delete Native-preparation shadow validation.
3. Resolve Capsule/Physics Body limits from the trusted current Bootstrap/Registry closure. The
   current owner exposes one symmetric `maxStepHeightMeters` plus `maxSlopeDegrees`; do not revive
   v2's independent up/down authoring thresholds or put any policy number in `scene.ts`.
   Remove the ineffective `isBidirectional` authoring flag: the current ground graph is undirected,
   while one-way transitions belong to `WRC-EVT-1`.
4. Publish report-only reachable bounds, XZ span, maximum distance, off-camera position/Chunk counts
   and component summaries.
5. Keep ground-only blocking policy Case/Profile-owned. Non-ground movement receives measurements,
   not a false rejection.
6. Map every failure to the current actionable diagnostic DTO with actual/expected/limit/delta,
   direction, source IDs and one bounded geometry repair action.
7. Consume the identity-bound final walkable topology built by 65D. At exact Spawn, target and band
   waypoints, sample the collision triangles and reject missing support or any height mismatch with
   the frozen Case position; a raw support-cell pass cannot hide smoothing drift or a topology hole.
8. Bind the report to the same ground-model and final topology used by materialization and to the
   resolved Subject traversal envelope, Case intent and frozen Package-root identity used by
   admission. Use the dedicated Native Block Ground Traversal Graph Builder Profile Ref; do not bind
   Native evidence to the Heightfield-named Profile identity even while their measured limits match.

Focused evidence: pure graph fixtures covering narrow footprint, low overhead, symmetric current
step/slope limits with directional failure evidence,
detours outside a band, disconnected islands, duplicate targets and stable diagnostic ordering.

## NBR-65D: topology, overlay and collision materialization

1. Derive the global support topology before any Chunk split. Use deterministic micro-grid rectangles,
   corner keys, smooth-height policy and triangle diagonal selection.
2. Generate the visible walkable overlay and Havok walkable proxy from the exact same topology bytes;
   apply the render epsilon only to the overlay.
3. Bind overlay batches to source Block IDs and visual groups in the live-handle registry and formal
   materializer metadata.
4. Generate exact-union faces for non-walkable solids; remove internal faces while preserving holes,
   concavity, blockers and cliff mass.
5. Extend frozen inventory with source IDs, logical Collider ID, proxy kind, bounds, counts and
   topology hash.
6. Fail before registration on logical Collider, vertex or triangle budget overflow. Roll back every
   partial Mesh and registration in reverse order.

Focused evidence: mixed-height surface, hole, T junction, cross-group seam, negative coordinate,
creation-order determinism, visual/collision byte relation, budget and throwing cleanup tests.

## NBR-65E: movement and ground boundary

1. Audit installed Babylon and Havok source for triangle-mesh filtering, support contacts, collision
   masks and disposal before implementing engine-dependent behavior.
2. Verify the existing SDK movement path can preserve configured ground speed along the derived slope
   using committed support contact data. Add no second support or medium owner.
   The executable regression must use the formal Native Module -> admission -> WorldPackage ->
   RuntimeHost -> Havok -> SDK Character path in both uphill and downhill directions; Canonical
   slopes, topology-only tests and BodyPort doubles are insufficient on their own.
3. Bound provider contact correction so it closes numerical error without becoming a second step or
   teleport path.
   Verify the installed Babylon four-plane simplex bound rather than assuming one contact plane.
   Do not port the supplemental fixed one-meter smoothing threshold or its Block-specific support
   cache: current 0.25m top increments must remain inside the G Bot 0.3m step contract and continue
   through the one SDK `checkSupport()` authority.
4. Derive exposed edges globally, coalesce only contiguous collinear equal-slope segments and freeze a
   closed internal boundary role in Contribution/Package identity.
5. Create invisible boundary proxies under existing Runtime physics ownership and apply one dedicated
   membership bit only to locked ground kernels.
6. Prove jump retention, ledge opt-out, water/flight bit removal, Camera exclusion, cadence, reset,
   replay, rebind, multiple Runtime isolation and throwing cleanup.

Focused evidence: actual installed-engine Havok tests plus the directly affected Runtime contract and
typecheck. Do not run the full repository here.

## NBR-65F: executable optimization

1. Measure at least two Chunk profiles on the five BWB Corpus scenes and the petrified-forest Case;
   freeze one policy from draw, geometry, collision and residency evidence.
2. Materialize Thin Instance batches only within a single Chunk, shape, palette role and semantic
   visual group. Keep singleton or incompatible Blocks as independent Meshes.
3. Replace live-handle rows with a closed union for independent Mesh or batch/instance identity;
   migrate Capture selection, visibility and tinting atomically.
4. Keep every visual batch resident and far-visible. Never use physics residency as visual culling.
5. Split logical collision into deterministic Chunk parts while retaining one logical Collider/
   Surface identity in Package metadata and overlays.
6. Maintain a bounded physics ring around every active Subject, activate Spawn before ready and update
   before each fixed Tick.
7. Own batch buffers, proxy Meshes, shapes, aggregates and boundary resources exactly once.

Focused evidence: deterministic resource benchmark, NullEngine batch identity, formal Capture target
isolation, real Havok traversal across Chunk seams, multi-Subject desired-ring union, partial activation
and reverse disposal.

## NBR-65G: lighting, material and Agent guidance

1. Keep Native production modules from creating lights. Reuse the Runtime neutral inspection fallback.
2. Align Profile materials to diffuse face shading, low specular and a small readability floor; share
   them across near/far batches.
3. Add the identity-bound walkable overlay pattern without changing palette, collision or evaluation
   masks.
4. Teach the Builder to declare complete playable floor groups, support depth, clearance, real stair
   columns and intentional ledges; forbid narrow scripted-only collision and air walls.
5. Preserve the evidence priority: uploaded reference, entry composition, top-down continuation, then
   Builder coherent hidden geometry.
6. Regenerate/freeze Skill copies through the trusted existing mechanism and prove byte parity.

Focused evidence: material/light owner tests, rendered authoring screenshot inspection, Skill tests,
forbidden-token census and typecheck if source changed.

## NBR-65H: consumer migration and parity verifier

1. Migrate Profile fixtures, BWB Corpus, representative generated Module, examples, Package metadata,
   formal Capture binder and Collider overlay to the new identity shape.
2. Produce new Candidate/Package/Receipt identities; never edit a published Package in place.
3. Implement a stable v2 capability-parity verifier that reports every in-scope ledger row as
   `passed`, `failed` or `not-applicable`, with evidence refs and no aggregate score that can hide a
   failed row.
4. Make deferred capabilities point to their WRC owner/task instead of being marked passed.
5. Delete temporary adapters, single-Block fallback materializers, duplicate cell maps, old Skill text
   and assessment-only wording that implies runtime optimization already exists.

Focused evidence: consumer tests, Package/Receipt verification, formal Capture/overlay identity,
clean-break census, parity verifier fixtures, Skill drift and test census.

## NBR-65J: v2 production-loop usability parity

1. Freeze `world-plan.png` and `entry-whitebox-target.png` into the existing
   Case/Generation Request identity and pass them to the Native Builder under
   semantic asset names on initial and repair Attempts. Preserve the uploaded
   reference as a separate named input.
2. Extend the sole current Evaluation Profile with
   `qualityGateMode: "report-only" | "required-for-publication"`. Newly mapped
   exploratory Native Cases use `report-only`; curated acceptance fixtures may
   use `required-for-publication`. Do not retain an old parser or implicit
   fallback.
3. Keep Native Check, Ground Analysis, Package/Receipt, Runtime, Spawn/Support,
   explicit Collider, identity, determinism and cleanup failures hard in both
   modes.
4. Publish every requested scripted traversal row even when a checkpoint cannot
   prove pass or block. Record the final-tick checkpoint and check outcome as
   `incomplete`; never synthesize success or throw
   `BABYLON_FORMAL_CAPTURE_*_CHECKPOINT_UNMEASURED` for this quality condition.
5. Run the existing bounded quality repair loop in both modes. At exhaustion,
   `required-for-publication` remains rejected. `report-only` returns exit zero
   with an explicitly non-accepted preview result, admitted Package identity,
   exact diagnostics, surviving Capture/evaluation paths and stable launch
   command. It must not call the final accepted-artifact publisher.
6. Add focused RED->GREEN coverage for named Planner assets, task identity,
   incomplete evidence projection, failed/incomplete quality preview, strict
   rejection, hard-admission rejection and cleanup. Update the parity verifier
   to bind these behaviors rather than source keywords.

Focused evidence: validation contract tests, generation request tests,
Runtime-contract/provider traversal tests, evidence projection, production
result/CLI exit tests and `git diff --check`. No full-suite replay occurs until
the real Case candidate is frozen.

## NBR-65I: real Case and closure

1. Run `/Users/xiateng/Downloads/测试集/001_mars_first_rain.png` through the formal Native
   production route using the new API.
2. Prove the production orchestrator treats every repairable Ground Analysis rejection as immutable
   repair evidence, supplies the checked source plus logical-ground/report diagnostics to the next bounded
   repair Attempt, and reruns Check/Ground Analysis before any Package or Capture publication. The chain
   permits Attempt 0 plus at most three repairs; a rejection at the final Attempt remains fail-closed. No
   rejected Attempt may invent Package/Capture identity. The repair task must also reread
   every frozen Case expectation and preserve opening regions, anchors and checked-bounds-center depth order;
   support connections stay in the correct ground/route visual group rather than extending ridge, cliff,
   landmark, structure or background groups toward Spawn.
3. Verify the full declared foreground and basin/forest floor, not only the scripted centerline.
4. Verify Spawn/support, free walking, mixed heights/steps, blockers, intentional ledges, cliff
   protection, cross-Chunk movement and far silhouette visibility.
5. Publish identity-bound Package, Receipt, opening/top/side Capture, Collider overlay, ground report,
   parity report, evaluation and a stable preview command. A failed visual score is previewable only
   after Package and Runtime admission pass. The terminal command returns `rejected-evaluation` with the
   exact diagnostic codes and immutable Package/Capture/evaluation/Receipt paths; it must not call the final
   publisher or label that candidate accepted. Native Case mapping also uses one static Collider identity
   (`contributionId === colliderId`), and the trusted Formal Capture binder rejects pass/block planes whose
   crossed `expectedCenterSide` is already satisfied at Spawn.
6. Record actual draw/buffer counts, collision parts, peak active physics objects, readiness and
   Browser feel separately from contract evidence.
7. Freeze the candidate, run the affected gates once, then request one exact-SHA Mode B plus
   runtime-deep review. Fix P0/P1 and rerun only invalidated evidence.
8. Merge the accepted checkpoint, update the live backlog and only then mark `NBR-65` complete and
   resume `NBR-70`.

## Explicit non-migrations and later owners

- Never create `block-world`, `block-world-three` or `block-world-compiler` compatibility packages.
- Never add a Native-specific RuntimeHost, Physics, Camera, Subject or Gameplay owner.
- Never restore a hidden foundation, automatic Mesh/name/tag collision scan, Runtime height sampler,
  Block-specific support grace/cache, public Chunk DSL, Batch DTO or a third Scene Source.
- Do not copy the supplemental Block-only Subject occlusion-fade switch into NBR-65; Camera behavior
  remains assigned to `WRC-CAM-1/2` and the existing Camera Domain.
- Do not implement v2 space transitions here. Record their behavior under `WRC-EVT-1`.
- Do not claim product Route/Nav/`goTo`, water/flight traversal, generic events, complete BNA-6 Golden
  Corpus, BNA-8 or WRC-ACC-1.

## Verification discipline

Each implementation checkpoint runs focused RED -> GREEN, the directly affected typecheck/build only
when its inputs changed, and `git diff --check`. Do not repeatedly run root `pnpm test`.

Only the final frozen candidate runs one affected/full exact-SHA gate set and one independent review.
Automated contract evidence, rendered Capture and manual Browser play are reported separately.
