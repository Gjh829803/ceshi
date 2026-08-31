# WRC-1 World Reconstruction & Control Milestone Design

**Project code:** `WRC-1`
**Chinese name:** 世界还原与可玩控制闭环一号里程碑
**Status:** approved scope; detailed work-package plans required before code
**Date:** 2026-08-30
**Source baseline:** `origin/main@8e0c1bdb9c6b0d037595b8a12605b4e9ad5c5794`
**Live status authority:** `docs/18-refactor-progress-and-backlog.md`
**BWB-3/4 settlement authority:** `docs/superpowers/specs/2026-08-31-babylon-block-settlement-and-step-closure-design.md`

## 1. Decision

WRC-1 groups the current Babylon Native authoring, block-whitebox reconstruction, Golden Humanoid
3C, semantic Action/Camera, spatial interaction, evidence, and repository-health work into one
searchable milestone:

```text
reference evidence / user intent
  -> JSON control plane + Babylon Native or Block authoring
  -> audited Candidate + locked WorldPackage
  -> one RuntimeHost / Babylon / Havok Gameplay world
  -> committed movement, Action, Camera and spatial events
  -> Capture, reconstruction scoring and bounded repair
  -> exact-tree Project Health evidence and production disposition
```

This file is the overall WRC-1 milestone design and dependency authority, not the detailed design for
each package. WRC-1 is an umbrella program, not a new runtime, Scene Source, package format, compiler, state
authority, test runner, or compatibility layer. Existing BNA, BWB, PHO, Gameplay, Camera, and 3C
specifications remain the detailed technical authorities for their domains. This document owns only
the combined milestone boundary, dependency order, incremental-integration policy, cross-domain
acceptance cases, and overall completion definition.

Current checkpoint: BNA-5 product SHA `2f46b3c9` has scoped GO from capable-runner isolation evidence.
BWB-3/4 and the BWB-5 mountain/T-space/steps/building/limited-interior/negative corpus are now integrated
through `main@d1ba942`; the same Block Session/Layout/finalize/Host settlement produces Babylon visuals,
frozen Contributions, SDK-owned Havok support and focused traversal evidence. PHO-6 is integrated through
PR #71, with generated-output fingerprint stability closed by PR #73. This unblocks BNA-6, BNA-7,
WRC-SR-1, BWB-6 and PHO-7, but does not complete formal Capture/Route, AI reconstruction scoring/repair,
PHO CI adapters, BNA-8 production disposition, Action/Camera closure or spatial events. PR #75 has since
closed the BWB-5 north-wall collision evidence, and PR #76 has closed the PHO detached-child test-fixture
stability follow-up on this document's source baseline.

### 1.1 Current execution priority: NBR-1 vertical slice

Until one real reference-driven Babylon Native Block Case completes the formal generation, Check,
Package, Runtime, Capture, evaluation and one-repair chain, the sole highest-priority WRC-1 slice is
[NBR-1 Babylon Native Block Reconstruction End-to-End](./2026-08-31-native-block-reconstruction-e2e-design.md).
NBR-1 consumes only the minimum BNA-6, BNA-7, WRC-SR-1 and WRC-SR-2 slices needed by that runnable Case;
it does not mark any whole parent work package complete.

BWB-6, full PHO-7/8, generalized Action/Camera, spatial events, the complete BNA-6 Golden Corpus,
product Route/Nav/`goTo`, BNA-8 and WRC-ACC-1 are explicitly deferred. They remain in this dependency
authority but must not block NBR-1 or be expanded opportunistically during it.

### 1.2 Unified Scene Viewer is a downstream developer tool

The [Unified Scene Viewer design](./2026-08-31-unified-scene-viewer-clean-break-design.md)
and [implementation plan](../plans/2026-08-31-unified-scene-viewer-clean-break-implementation.md)
are downstream developer-tool inputs, not WRC-1 architecture authorities and not additional WRC work
packages. WRC-1 retains its 33-package count, product capability graph, evidence ownership and completion
definition. The Viewer may consume accepted WRC outputs but cannot mark a WRC package complete or redefine
its protocol.

The implemented Viewer contract is Canonical-only: after its atomic cutover, `apps/playground` is the
sole developer Viewer shell and `pnpm dev` exposes only the curated `feel-flat`, `traversal-course` and
`action-lab` presets. The target Catalog contains no controlled-Subject field: the Host parses the complete
AuthoringSpec and proves that `startup.controlledEntityId` resolves to
`worldkit://subject-definition/humanoid.g-bot@2`. `worldkit run` and Studio may then provide a Host-selected
temporary Canonical source to that shell without publishing it to the curated Catalog.

The current tree implements USV-0/USV-1 atomically: legacy `authoring=1` and `catalog-gameplay` source
selection are removed, the three curated presets are published, and Playground, `worldkit run` and Studio
share the same Viewer shell. This downstream tool status does not increase WRC completion, admit Native
Viewer support or authorize deletion of WRC/NBR evidence and Harnesses.

Native Package playability remains owned by BNA/NBR Runtime and verification Harnesses. It must not add a
Native member to the accepted Canonical-only Viewer target Catalog/bootstrap, route a Native Package through
the Viewer-target `worldkit run` source-selection contract, or use Viewer work as a BNA production/admission gate.
Native Viewer support requires the applicable BNA production/admission disposition and a later separate
current-only change that atomically updates the Viewer Host and every consumer.

| Viewer relationship | WRC/BNA owner retained | Viewer may consume | Viewer must not own |
|---|---|---|---|
| controlled Subject and actions | Authoring/Registry plus Gameplay/Action | parsed Canonical AuthoringSpec and committed state | duplicate Subject ref, Action reducer or animation truth |
| Runtime, Physics and Camera | RuntimeHost, CharacterMovement, Havok adapter and Camera Domain/Director | Browser-facing observation and existing commands | Runtime, Physics, Camera state or admission |
| formal Capture and reconstruction evidence | P0.2/P0.3, BNA-7 and WRC-SR | identity-bound artifacts for display | Capture protocol, score, Receipt or evidence mutation |
| WRC/BNA Corpus and Harnesses | BWB/BNA/WRC package named by the artifact | links and read-only inspection | cleanup eligibility or completion status |
| source selection | Canonical Authoring Host; future Native decision remains BNA-owned | one already validated Host bootstrap | Scene Source, WorldPackage, Compiler or Browser Protocol |

The Playground/CLI/Studio source-selection cutover is one atomic Viewer checkpoint. It depends on the
current Canonical Authoring parser, G Bot Subject admission, existing RuntimeHost/Browser V5 owners and
the affected Playground, CLI and Studio gates. It does not depend on incomplete Native Viewer work and
must not modify Browser V5, RuntimeHost or WorldPackage contracts. The trusted artifact renderer/Capture
remains a separate evidence tool; only its WRC owner may plan a migration, and it is never counted as a
second product Viewer.

Viewer cleanup is fail-closed. `artifacts/scenes`, BWB/BNA reconstruction Corpus, Native admission and
Runtime Harnesses, formal Capture/Receipt fixtures and identity-bound acceptance artifacts are outside
USV cleanup unless their owning WRC/BNA work package explicitly migrates them. Native Web UI or its
verification entry may be deleted only after BNA-7 evidence migration and the applicable BNA-8
disposition; historical cases require the corresponding BWB/BNA/WRC-SR owner sign-off. Every deletion
also requires zero production/test references, migrated identity-bound fixtures and the affected owner
gates. Directory tidiness is not evidence of obsolescence.

## 2. Why this is a major milestone

WRC-1 is complete only when the SDK can turn reference intent into a reproducible playable whitebox
world whose visual structure, collision, player movement, Actions, Camera changes, spatial events,
Capture evidence, and engineering-health result are bound to one exact WorldPackage and source tree.

That establishes the first production-shaped loop in which:

- AI-facing authoring can express irregular mountains, cliffs, stairs, T-shaped spaces, buildings,
  and limited interiors without making JSON a geometry programming language;
- Babylon Native code owns only admitted scene construction, while SDK/Havok owns Gameplay,
  collision, controlled Subject, input, Camera authority, fixed Tick, lifecycle, and evidence;
- PR #41's Golden Humanoid state model remains the only movement/Action/Camera projection chain;
- a scene can respond to committed player presence without using Mesh names, render frames, or
  scene-local timers as Gameplay truth;
- failed reconstruction can be diagnosed and repaired through bounded authoring changes rather than
  Runtime hot patches; and
- every production claim is tied to exact-tree automated, rendered, manual, and independent-review
  evidence.

## 3. Non-goals

WRC-1 does not deliver:

- arbitrary photoreal final art, pixel-perfect single-view inversion, or a general 3D asset generator;
- a third Scene Source, a Three.js Runtime, or a Canonical/Native hybrid geometry overlay;
- public product-level `goTo`, path replanning, NPC behavior, networking, streaming, caves, or a
  general multi-floor navigation system;
- arbitrary user scripting, unbounded event callbacks, or Runtime source mutation;
- mounted, vehicle, flight, swimming, equipment, and combat breadth unless a named WRC-1 acceptance
  case explicitly requires a narrow committed-state slice;
- a permanent V1/V2/V3 compatibility family for contracts changed before release; or
- a mega-branch that delays usable changes until the whole milestone finishes.

## 4. Frozen principles

### 4.1 One authority per fact

| Fact | Sole owner | Forbidden shadow owner |
|---|---|---|
| normalized player intent | Control normalizer | Animation Set, Mesh event, render callback |
| Semantic Action lifecycle/variant admission | Gameplay/Action authority | Babylon animation player |
| movement proposal, jump episode, vertical phase | CharacterMovementRuntime | `runtime-babylon` private state machine |
| collision/support result | SDK BodyPort/Havok adapter | height sample, visual root, animation foot state |
| committed world/action/event state | RuntimeHost commit barrier | scene-local mutable cache |
| semantic Camera selection | Camera Domain | Babylon Camera callbacks |
| final Camera pose | CameraDirector | Action resolver, scene module |
| scene visual construction | admitted Native Candidate | Canonical shadow Plan or Runtime mutation |
| static collision contribution | Native registration boundary frozen by Host | raw Babylon Physics objects from scene code |
| project-health facts | existing owner gates and Sensors | a second validator or health score |

Any state that can change movement, collision, Action selection, Camera semantics, event outcome, or
deterministic evidence must have a declared owner and must participate in the required
Snapshot/Hash/Reset/Replay/Rollback boundary. Provider-local telemetry may remain local only when it
cannot influence those facts.

### 4.2 Current-only clean break

The repository is unreleased. A contract change in WRC-1 updates all active consumers, fixtures,
generated artifacts, and examples in the same accepted tree, then deletes the replaced field, parser,
adapter, alias, fallback, package, or entry point. No work package may obtain a GO while retaining a
legacy/new dual path.

### 4.3 Reference fidelity is semantic, not pixel equality

Whitebox reconstruction is evaluated through topology, silhouette, landmark placement, spatial
layers, route continuity, opening composition, collision, spawn support, and player traversability.
Textures, clouds, flowers, cinematic lighting, and single-view hidden geometry are not encoded as
collision geometry. Pixel similarity may be retained as advisory visual evidence but never overrides
a failed topology, collision, route, or composition requirement.

### 4.4 Incremental integration

Every work package ends in a usable `main` checkpoint. A work package uses one focused branch/PR,
contains one reviewable authority change or independently useful capability, and updates status only
after merge. Downstream work rebases on the latest merged `main`; it does not accumulate a long-lived
private replacement of current Runtime contracts.

### 4.5 Evidence-seeking decision rule

Implementation must not stall on uncertain engine behavior or reinvent a solved mechanism. The
decision order is:

1. inspect the current repository owner, installed lockfile version, and installed Babylon/Havok
   source;
2. when the answer remains uncertain or one focused attempt does not resolve the issue, search
   official documentation, maintained mainstream open-source implementations, and relevant primary
   papers instead of continuing from memory;
3. record the external pattern, exact version/commit, license/provenance constraint, and the local
   contract it informs in the task design or review;
4. reuse an existing project/platform/engine API or mature dependency before adding custom utility
   code; and
5. reject any borrowed design that introduces a second state owner, provider leakage, compatibility
   debt, nondeterministic evidence, or a new public dialect.

External precedent is evidence, not architecture authority. WRC-1's frozen owner map, current-only
clean break, SDK/Havok responsibility boundary, deterministic transaction, AI-facing naming, and
scoped verification rules remain decisive when a popular project uses a different tradeoff.

## 5. Workstream boundaries

WRC-1 contains 33 implementation work packages:

- 4 Jump correction packages: `JUMP-0` through `JUMP-3`;
- 6 Native production packages: `BNA-3` through `BNA-8`;
- 4 Block reconstruction packages: `BWB-3` through `BWB-6`;
- 10 Project Health packages: `PHO-0A`, `PHO-0B`, and `PHO-1` through `PHO-8`;
- 9 cross-domain closure packages: `WRC-GOV-1`, `WRC-ACT-1`, `WRC-ACT-2`, `WRC-CAM-1`,
  `WRC-CAM-2`, `WRC-SR-1`, `WRC-SR-2`, `WRC-EVT-1`, and `WRC-ACC-1`.

Completed prerequisites are PR #41, BNA-0 through BNA-2, BWB-0 through BWB-2, and the PHO design
and implementation plan. PC-10B through PC-90 are BNA-2 implementation history and are not reopened.

The first executable work-package design and plan are:

- `docs/superpowers/specs/2026-08-30-wrc1-pr41-split-jump-correction-design.md`;
- `docs/superpowers/plans/2026-08-30-wrc1-wave-a-jump-authority-implementation.md`.

## 6. Dependency graph

```text
PR #41
  -> JUMP-0 -> WRC-GOV-1 -> JUMP-1 -> JUMP-2 -> JUMP-3
                                      \-> WRC-ACT-1 -> WRC-ACT-2
                                                        \-> WRC-CAM-1 -> WRC-CAM-2

BNA-1 + BNA-2 -> BNA-3 -> BNA-4 -> BNA-5
BNA-3 -> BWB-3
BNA-4 -> BWB-4
BNA-5 + BWB-3 + BWB-4 -> BWB-5 -> BWB-6
BNA-3 + BWB-3 -> WRC-SR-1
BNA-5 + WRC-SR-1 -> BNA-6
BNA-6 + BNA-7 + WRC-SR-1 -> WRC-SR-2 -> BNA-8

BNA-4 + WRC-ACT-1 + WRC-CAM-1 + BWB-4
  -> WRC-EVT-1

BNA-4 -> BNA-7 -> BNA-8

BNA-5 + BWB-5
  -> NBR-1(NBR-00 -> NBR-10 -> NBR-20 -> NBR-30 -> NBR-40 -> NBR-45
             -> NBR-50 -> NBR-60 -> NBR-70 -> NBR-90)
NBR-1 is an execution-slice alias, not a 34th WRC package; it consumes minimum
BNA-6 + BNA-7 + WRC-SR-1 + WRC-SR-2 slices only

PHO-0A -> PHO-0B + PHO-1
PHO-0B -> PHO-2 + PHO-4 + PHO-5
PHO-0B + PHO-1 -> PHO-3
PHO-1..PHO-5 -> PHO-6 -> PHO-7 -> PHO-8

BNA-8 + BWB-6 + WRC-ACT-2 + WRC-CAM-2 + WRC-EVT-1 + WRC-SR-2 + PHO-8
  -> WRC-ACC-1
```

BNA-8 remains the Native Lane production disposition. WRC-ACC-1 is the broader playable-world
milestone acceptance and therefore consumes, rather than replaces, BNA-8 and PHO-8.

## 7. Task contracts

Each row defines the minimum stable handoff. Detailed implementation plans must repeat exact file and
interface ownership before code begins.

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / stable input -> output | Required evidence | Mode |
|---|---|---|---|---|---|---|
| JUMP-0 | Freeze the PR #41-compliant split-jump design and delete/retain inventory for PR #51 | PR #41 | WRC-GOV-1, JUMP-1 | Jump spec/review only; PR #51 diff + authority map -> one approved contract | design self-review, Mode A/B review | main-agent-only |
| WRC-GOV-1 | Make PR #41 authority-extension rules executable and durable | JUMP-0 | JUMP-1, WRC-ACT-1, PHO-1/4 | `AGENTS.md`, runtime checklist, package/authority tests; frozen owner map -> stable rejection of shadow owners | forbidden-input/state fixtures, dependency and exact-key tests | sequential, main-agent-only |
| JUMP-1 | Add the smallest committed Jump Variant/episode contract required by the accepted behavior | WRC-GOV-1 | JUMP-2 | Gameplay/CharacterMovement contracts only; normalized intent + support -> snapshot/hash-bound variant | RED/GREEN parse, invalid combination, reset/replay/rollback tests | sequential |
| JUMP-2 | Rebuild small/large jump on CharacterMovement and committed presentation; delete `SplitJumpIntentV1` and animation-driven input mutation | JUMP-1 | JUMP-3 | CharacterMovement + subject-actions + Babylon projection; committed episode -> physical proposal + visual key | focused physics/presentation/rollback/cadence tests | sequential |
| JUMP-3 | Preserve admitted assets and useful foot anchoring, close browser/manual behavior, and replace PR #51 with reviewed code | JUMP-2 | WRC-ACT-1 | asset/registry/evidence integration; exact code SHA -> browser and review receipts | affected gates once, real Chromium, manual feel check, Cursor Cloud review | main-agent-only |
| BNA-3 | Build Native Bundle, dependency/asset locks, Contribution Hash, one WorldPackage, and Build Receipt | BNA-1, BNA-2 | BNA-4, BWB-3, BNA-5..8 | existing `world-package` + provider-neutral runtime contracts; audited Native source/resources -> verified package/receipt | implementation-plan tasks, package tamper/adversarial tests, exact-SHA review | sequential |
| BNA-4 | Admit verified Native packages to the single RuntimeHost/Gameplay/Havok Kernel | BNA-3 | BWB-4, BNA-5..8, WRC-EVT-1 | RuntimeHost/runtime-babylon; verified package + frozen contributions -> atomic playable session | real Havok, spawn/support/collider/lifecycle/rollback tests | sequential, main-agent-only |
| BNA-5 | Close Trusted Local and Hosted Isolated trust profiles, budgets, tenant caps, and threat gates | BNA-4 | BNA-6, BWB-5, BNA-8 | Host admission/isolation only; BNA-2 audit + package identity -> bounded isolated execution receipt | adversarial security/cap/cleanup tests and threat-model review | sequential |
| BNA-6 | Measure AI generation and repair success under frozen budgets and identities | BNA-5, BNA-3, BNA-4, WRC-SR-1 | WRC-SR-2, BNA-8 | measurement producers, source adapters and Corpus execution only; frozen task/reference/profile + WRC-SR protocol -> exact-package evidence/result | Golden corpus, independent attempts, visual/manual evidence | sequential |
| BNA-7 | Produce formal Capture and optional Route/Nav Evidence from the same frozen Surface | BNA-4, BNA-3 | WRC-SR-2, BNA-8 | capture/route owners only; verified session/surfaces -> identity-bound evidence | capture integrity, route provenance, negative fixtures | sequential |
| BNA-8 | Issue scoped Native GO/NO-GO for Trusted Local, Hosted, and Route claims | BNA-5, BNA-6, BNA-7, WRC-SR-2, BWB-5, PHO-7 | WRC-ACC-1 | review/docs/status only; exact evidence set -> scoped disposition | full-dimension review, no open blocking finding, docs truth | main-agent-only |
| BWB-3 | Render direct Babylon block Meshes with stable visual groups and local opening/top/side captures | BNA-3, BWB-2 | WRC-SR-1, BWB-5 | block-profile authoring only; valid Layout -> Mesh groups + local screenshots | structural snapshot and rendered image checks | sequential |
| BWB-4 | Freeze core static Collider Contributions and traversal bindings from the same in-memory Layout | BNA-4, BWB-2 | WRC-EVT-1, BWB-5 | block profile contribution adapter; Layout -> Host-frozen collider contribution | overlay, support, overlap, disposal, Havok traversal tests | sequential |
| BWB-5 | Close mountain, T-space, stairs, building, limited-interior, and negative reconstruction corpus | BNA-5, BWB-3, BWB-4 | BWB-6, BNA-8 | corpus/evidence only; frozen cases -> structural, visual, collision and manual receipts | screenshots, collider overlay, spawn, player traversal, negative rejection | sequential |
| BWB-6 | Evaluate profile-side Thin Instance, Chunk, and Collider coalescing without changing semantics | BWB-5 | WRC-ACC-1 | block-profile optimization proposal only; equivalent Layout -> measured grouping eligibility | equivalence fixtures, resource benchmark, no Runtime/Havok edits | sequential |
| WRC-ACT-1 | Freeze general ActionDefinition/Request/Receipt Context, Channel Lock, ActionVariantSet and PoseSetProfile | JUMP-3, WRC-GOV-1 | WRC-ACT-2, WRC-CAM-1, WRC-EVT-1 | gameplay/subject-actions/registry contracts; committed context -> exact variant/presentation binding | closed-schema/hash/ambiguity/missing-binding tests | sequential, main-agent-only |
| WRC-ACT-2 | Complete fixed-Tick Action/Posture reducer, fall/land, cancel/interrupt, fallback, and safe capsule posture changes | WRC-ACT-1 | WRC-CAM-2, WRC-ACC-1 | Gameplay + CharacterMovement + approved BodyPort query; commands/support -> committed Action/Posture/receipts | replay/reset/blocked-clearance/two-instance/browser tests | sequential |
| WRC-CAM-1 | Complete committed Context -> Camera Domain -> CameraDirector for Actions, jump/land, narrow/interior, and event focus | WRC-ACT-1, current Camera Domain | WRC-CAM-2, WRC-EVT-1 | camera/runtime-host/runtime-babylon boundaries; committed facts -> selection decision -> final pose | atomic rollback, safe-view, pause/reset/cadence/isolation tests | sequential |
| WRC-CAM-2 | Close first/third-person and semantic transition fixtures plus two human FeelReviewReceipts | WRC-CAM-1, WRC-ACT-2 | WRC-ACC-1 | camera fixtures/evidence only; locked profiles + cases -> automated/numeric/rendered/manual receipts | real Chromium/Havok, two human rounds bound to SHA/profile/take | main-agent-only |
| WRC-SR-1 | Freeze reconstruction scorecard and reference corpus semantics | BNA-3, BWB-3 | WRC-SR-2 | evaluation DTO/corpus; reference/Scene Brief/capture -> topology/composition/route/collision scores | asymmetric and negative score fixtures, no pixel-only GO | sequential, main-agent-only |
| WRC-SR-2 | Implement bounded structured repair from stable diagnostics to a new audited Candidate/package | BNA-6, BNA-7, WRC-SR-1 | BNA-8, WRC-ACC-1 | authoring/evaluation orchestration; failed scored result -> bounded source/resource revision -> new result | max-cycle, no-output, stale-identity, non-idempotent submission tests | sequential |
| NBR-1 | Deliver one real reference-driven Native Block world through AI generation, formal Check/Package/Runtime/Capture, dimensioned evaluation and at most one immutable repair | BNA-5, BWB-5 | the resumed horizontal WRC backlog | orchestration and integration only; reference/Brief -> final runnable verified WorldPackage and receipts; the Canonical-only Viewer target is not a dependency | real AI task, focused gates, playable Havok traversal, identity-bound captures, exact-SHA Cloud gates/review | main-agent-only |
| WRC-EVT-1 | Prove location-triggered committed event, world change, Subject/object response, and Camera Context | BNA-4, BWB-4, WRC-ACT-1, WRC-CAM-1 | WRC-ACC-1 | Gameplay spatial sensor/command path; frozen region + committed pose -> event/receipt/state/camera result | enter/exit hysteresis, replay/reset/cadence/two-session/browser evidence | sequential |
| PHO-0A | Freeze current-only health DTOs, Profile, policies, debt, and fingerprints | PHO design | PHO-0B, PHO-1..8 | `scripts/project-health` contracts/config only | parser/canonical/adversarial tests | sequential, main-agent-only |
| PHO-0B | Add the sole bounded/redacted execution envelope | PHO-0A | PHO-2..5 | process runner only; trusted owner-token descriptor -> bounded execution evidence | timeout/owned-process/temp/repository-state tests | sequential, main-agent-only |
| PHO-1 | Extend the existing workspace graph owner and add boundary/supplemental-authority Sensors | PHO-0A, WRC-GOV-1 | PHO-3, PHO-6 | existing workspace scanner + supplemental policy -> two observations | duplicate-owner/compat/debt-identity fixtures | sequential, main-agent-only |
| PHO-2 | Adapt contract/generated parity and supply-chain evidence | PHO-0B | PHO-6 | existing owner receipts + inventory/provenance policy -> observations | drift/license/provider-snapshot fixtures | sequential |
| PHO-3 | Plan exact-head affected gates from Git diff, graph, and test census | PHO-0B, PHO-1 | PHO-6, PHO-7 | change-impact planner; exact base/head -> stable Gate Plan | public-contract/runtime/browser/build path fixtures | sequential |
| PHO-4 | Add Runtime lifecycle, authority, cadence, and determinism probes | PHO-0B, WRC-GOV-1 | PHO-6, PHO-7 | registered probes only; exact runtime input -> observation | repeat/reset/throw/30-60-120/two-instance fixtures | sequential |
| PHO-5 | Add performance, visual, documentation-truth, and independent-review Sensors | PHO-0B | PHO-6, PHO-7 | evidence adapters only; owner artifacts -> observations | budget/stale/link/status/review fixtures | sequential |
| PHO-6 | Produce exact audit output, aggregate policy/report, and expose health CLI | PHO-1..5 | PHO-7, PHO-8 | one Host/Registry/aggregator/CLI; own-checkout exact-clean tree + registered Gate -> validated in-memory evidence -> actual Sensor -> internal Observation -> report/explain；PR binds explicit ancestor base to trusted event exact head and rejects a synthetic merge checkout by SHA equality；external Receipt/Observation is never admission | source-closure identity, evidence parser, forged-input rejection, PR identity, ordering/fingerprint/cap/exit tests | sequential, main-agent-only |
| PHO-7 | Integrate PR, main-push, Nightly, and Release without repeating owner gates | PHO-3, PHO-4, PHO-5, PHO-6 | PHO-8, BNA-8 | workflows only; exact-head same-process Gate/Sensor results + mode -> retained report | workflow layout, bounded CI runs, cleanup | sequential, main-agent-only |
| PHO-8 | Complete adversarial adoption, independent Cloud review, baseline, and docs switch | PHO-7 | WRC-ACC-1 | review/baseline/docs only; exact reports -> disposition/adopted baseline | D1-D6, Cursor Cloud, clean tree, no open blocking finding | main-agent-only |
| WRC-ACC-1 | Accept or reject the complete WRC-1 milestone with flagship playable cases | BNA-8, BWB-6, WRC-ACT-2, WRC-CAM-2, WRC-SR-2, WRC-EVT-1, PHO-8 | none | acceptance/review/docs only; all scoped receipts -> final WRC-1 disposition | three flagship cases, exact-SHA full review, docs/Quickstart truth | main-agent-only |

## 8. Reconstruction and interaction acceptance cases

WRC-1 keeps one stable corpus identity while individual cases may gain new result receipts.

### 8.1 Mountain/T-space exploration

- irregular mountain and cliff silhouettes without heightfield spikes standing in for constructed forms;
- a readable T-shaped route with one overlook and one occluded branch;
- safe spawn, continuous primary traversal, collider overlay, and opening composition;
- opening, top-down, and side structural captures.

### 8.2 Stairs, building, and limited interior

- modeled stairs and platforms rather than heightfield stair pixels;
- exterior-to-interior transition with walls, doorway, ceiling, camera collision, and no clipping;
- no claim of general multi-layer navigation, cave support, or streaming;
- ordinary and crouched clearance evidence only after WRC-ACT-2 admits posture support.

### 8.3 Interactive reconstruction

- small and large jump use the PR #41 state path and admitted animation bindings;
- entering one frozen spatial region commits a stable event and visible object/Subject state change;
- Camera Context changes from committed Action/region facts and returns without stale target/modifier;
- identical fixed input at 30/60/120-like render cadence produces identical authoritative hashes;
- Reset and a second session reproduce the same initial state without leaked listeners, timers, bodies,
  animation groups, Camera state, or event history.

## 9. Reconstruction scorecard

The scorecard reports independent dimensions rather than one opaque quality number:

| Dimension | Required evidence | Blocking rule |
|---|---|---|
| topology | regions, route branches, spatial layers, occlusion relationships | missing required branch/layer is blocking |
| semantic silhouette | stable visual groups and landmark bounds from planned views | missing or merged required target is blocking |
| opening composition | normalized regions/anchors, Camera pose, foreground/mid/background | failed required region or anchor is blocking |
| traversal | spawn support, route/surface evidence, real controlled Subject | unsupported spawn or required route failure is blocking |
| collision | frozen contributions, Havok overlay, walls/steps/ceilings | visual/collision divergence is blocking |
| deterministic build | Candidate replay, package/receipt identity, reset/replay | hash or cleanup mismatch is blocking |
| visual similarity | rendered comparison and human notes | advisory unless it reveals a semantic failure |
| interaction | committed event/action/camera sequence | missing, duplicate, or render-derived event is blocking |

## 10. Development and verification policy

WRC-1 optimizes for implementation throughput without weakening evidence:

1. Initialize every worktree with `pnpm install --frozen-lockfile`. pnpm store reuse keeps this cheap;
   do not manually share `node_modules` or trade away a complete AI development environment.
2. Write one behavior-level failing test before each production change and confirm the expected RED.
3. Run only that focused test until GREEN; refactor while keeping it GREEN.
4. At the end of a work package, run each affected typecheck/test/build/browser gate once. Do not run a
   narrow alias after a broader same-tree gate already covered it.
5. Documentation-only commits use self-review, link/status inspection, and `git diff --check`; they do
   not replay Runtime tests.
6. Full repository gates and independent deep review run in Cursor Cloud against the exact merge
   candidate SHA at wave boundaries, not after every local edit.
7. A later change invalidates only evidence whose inputs or claims it can affect. Narrow fixes rerun
   the reproducer and invalidated gates, not the entire historical matrix.
8. Browser/rendered/manual evidence is collected only when the claim requires that layer. Unit tests
   do not masquerade as visual or feel evidence.

Before production code begins for a work package, its implementation plan must name exact files,
public and internal interfaces, deletion targets, RED/GREEN reproducer, affected-gate set, review
boundary, and commit boundary. The plan may consume an already approved domain plan, but it may not
replace missing detail with this umbrella document. Architecture/authority tasks, Runtime/Havok
integration, Browser behavior, wave merge candidates, and final acceptance are mandatory independent
review points; ordinary inner-loop edits are not.

## 11. Incremental merge waves

| Wave | Merge order | Main becomes useful for |
|---|---|---|
| A | JUMP-0, WRC-GOV-1, JUMP-1..3 | correct split jumps and durable PR #41 extension rules |
| B | BNA-3 | locked Native packages and receipts available to downstream work |
| C | BNA-4, BWB-3, BWB-4 | formally playable Native/block worlds with SDK Havok |
| D | WRC-ACT-1/2, WRC-CAM-1/2 | reusable Action variants, posture, and semantic Camera transitions |
| E | BNA-5, WRC-SR-1, BWB-5, BNA-6 | hosted trust plus frozen evaluation protocol and measurable reconstruction inputs |
| F | BNA-7, WRC-SR-2, WRC-EVT-1, BWB-6 | formal Capture/Route evidence, bounded repair, interaction and optimization evidence |
| G | PHO-0A..8 integrated incrementally as dependencies mature | exact-head health planning and non-duplicated CI evidence |
| H | BNA-8, WRC-ACC-1 | scoped Native disposition, complete milestone disposition and accurate public documentation |

Each row represents multiple small PRs, not one batch PR. A task may be merged as soon as its own
deliverable is independently useful, its dependencies are present on `main`, and its exact accepted
tree has no open blocking finding.

## 12. Documentation and status ownership

- This document owns WRC-1 scope, dependency order, merge policy, and overall acceptance.
- `docs/18-refactor-progress-and-backlog.md` is the only live completion-status authority.
- BNA, BWB, PHO, 3C, Gameplay, Camera, and Source-neutral Asset specs remain their detailed design
  authorities; WRC-1 links rather than copies their mutable implementation truth.
- Per-task implementation plans live under `docs/superpowers/plans/` and never span independent
  authority changes merely to reduce PR count.
- Exact-SHA review and completion evidence live under `docs/reviews/`.
- README/Quickstart switches only after the relevant scoped GO. WRC-1 does not present experimental
  Hosted, Route, posture, event, or Camera capabilities as production before their own gates close.

## 13. Completion definition

WRC-1 is complete only when all 33 work packages are marked complete in the live backlog and:

- PR #51 has been replaced by a PR #41-compliant implementation with no Babylon-owned jump state;
- Native and block worlds load from one verified WorldPackage through the one RuntimeHost/Kernel;
- the three acceptance cases pass their structural, collision, traversal, Action, Camera, interaction,
  Capture, visual, manual, and deterministic evidence requirements;
- bounded repair produces a new audited Candidate/package rather than mutating a running world;
- PHO produces an exact-tree report without duplicating owner gates, and BNA/WRC final reviews consume
  rather than substitute that evidence;
- two human Camera/control feel reviews are bound to exact Commit, Profile Hash, and Fixture Take;
- no accepted tree contains a legacy/new compatibility path, shadow Scene Plan, second movement/
  Action/Camera owner, stale generated artifact, or unclassified open P0/P1/P2 finding; and
- the final public documentation states exactly which Trusted Local, Hosted, Route, Action, Camera,
  reconstruction, and interaction capabilities are production, experimental, or unsupported.

## 14. Deferred programs

APA-0 through APA-6 remain the separate source-neutral asset production/admission program. WRC-1 may
consume already published and admitted Resource Refs, but it does not make APA a prerequisite or pull
provider routing and asset publication into Native scene work. General NPC navigation, vehicles,
mount breadth, equipment/combat breadth, networking, streaming, and full multi-floor interiors remain
outside WRC-1 unless accepted through a later dedicated milestone design.

### 14.1 Generative presentation after formal Capture

The August 2026 Magpie technical report demonstrates a useful downstream pattern: the Game Engine
first resolves input, traversal, collision, events, state, and Camera, then an independent generative
renderer converts synchronized whitebox observations into styled video. The renderer does not receive
raw player actions, hidden Gameplay state, object properties, or event records as rule-level control;
it sees the already-resolved visible consequence. This precedent reinforces WRC-1's existing owner map
rather than adding another owner. Reference:
[`Magpie: Real-Time World Renderer for Interactive Games`](https://arxiv.org/abs/2608.27168).

Any future generative presentation work follows this boundary:

```text
verified WorldPackage + one RuntimeHost/Babylon/Havok session
  -> BNA-7 identity-bound synchronized Capture
  -> read-only generative-presentation condition bundle
  -> untrusted replaceable renderer
  -> styled image/video artifact + provenance/evaluation receipt only
```

- It is not a third Scene Source, Runtime renderer authority, WorldPackage mutation path, asset
  admission bypass, or Gameplay feedback loop. It cannot create or modify geometry, Physics, Subject,
  Action, Camera, Event, State, Tick, Route, or lifecycle objects.
- The condition bundle is derived only after Runtime commit and is bound to the exact
  `worldBuildIdentityHash`, Runtime session/epoch, fixed Tick range, Capture profile, Camera matrices,
  and source frame hashes. Whitebox color and Camera are mandatory. Depth, normals, semantic IDs, and
  motion vectors may be added as engine-derived structural channels because they reduce image-only
  depth and boundary ambiguity without exposing a second Gameplay dialect.
- Style text and an approved first-frame appearance reference are initialization-only presentation
  inputs. Raw input commands, collision records, hidden state, and event payloads remain outside the
  renderer. A Gameplay change reaches it only through the next committed visible observation.
- Generated frames are untrusted presentation artifacts. They may receive structural-adherence,
  temporal/revisit-consistency, appearance-quality, latency, and cost measurements, but they never
  prove collision, traversal, event, or Action correctness. Those claims continue to use the source
  Runtime receipts and whitebox evidence.
- Ordinary Babylon rendering remains the playable fallback and inspection truth. Renderer failure,
  timeout, drift, or policy rejection cannot pause, roll back, or alter the authoritative simulation.
- The first supported experiment is offline or asynchronous post-Capture rendering, compatible with
  the existing explicitly requested recording/Seedance workflow. Interactive frame-wise streaming is
  a later feasibility gate and cannot be called production from chunk-wise demonstrations.
- Cloud rendering receives only the curated immutable condition bundle and presentation inputs. It
  receives no repository source, credentials, provider handles, mutable Runtime connection, or hidden
  WorldSession state.

This deferred program starts only after BNA-7 can produce formal identity-bound Capture. It is split
into three future packages so implementation cannot smuggle model concerns into Runtime owners:

| ID | Goal | depends_on | Output and gate |
|---|---|---|---|
| GPR-0 | Freeze the source-neutral condition bundle, provenance receipt, redaction, and no-writeback threat boundary | BNA-7 | Dedicated design plus closed Schema, parser, tamper/identity/redaction tests |
| GPR-1 | Evaluate one replaceable offline renderer on the frozen reconstruction corpus | GPR-0, WRC-SR-1 | Styled artifacts plus structural/temporal/quality/cost receipts; no Runtime claim |
| GPR-2 | Decide whether frame-wise interactive streaming is viable without weakening simulation authority or fallback | GPR-1 | Pre-registered latency/consistency thresholds and scoped GO/NO-GO; no automatic product adoption |

`GPR-0` through `GPR-2` are not part of the 33 WRC-1 implementation packages or the WRC-1 acceptance
critical path. A later milestone must approve their detailed design, dependencies, privacy model,
budgets, model/provider locks, and exact verification thresholds before code is added.
