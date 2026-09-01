# M8-S1 `mountedOn` Human-Skateboard Completion Review

> **Draft / NO-GO.** The current working tree adds a current-only Camera V2 clean break and regenerated
> contract/package artifacts after historical candidate `7f9abd8bc78010cd0e04df8542d40f18c24bfae4`.
> It is therefore a new product candidate whose exact pushed SHA and Cloud evidence are still pending.
> Historical Cloud and `d6d82c4f7eec054e6051b7a635ef28f78ce790a4` review results remain recorded below
> without being promoted to the new tree. The final independent Claude and Grok review of the repaired exact
> SHA has not started, so no M8-S1 completion GO is claimed.
> This document must not be converted to a completion GO until those results are recorded and every blocking
> finding is dispositioned against the final candidate.

## 1. Review metadata

| Field | Value |
| --- | --- |
| Date | 2026-09-01 |
| Review mode | Mode B change review plus the complete Runtime deep-review checklist |
| Runtime/product candidate | Current working tree after `d6d82c4f7eec054e6051b7a635ef28f78ce790a4`; repaired exact pushed SHA pending |
| Final review tree | Pending product-candidate Cloud closure and exact-SHA Claude/Grok review |
| Diff base | `df2dcd53434bd26a97dbb3e835fb99ad56eb82a9` |
| Branch | `codex/m8-s1-completion` |
| Runtime dependencies | Babylon.js `9.23.0`; Havok `1.3.14` |
| Scope | Strict `mountedOn` contract, atomic Mount/Dismount, possession transfer, Rider projection, safe Dismount, retained-Physics `supportedBy`, narrow mounted Camera seam, complete Capture journal and formal four-phase verifier |
| Current disposition | **NO-GO pending the new exact-SHA Cloud matrix and final Claude/Grok review** |

Authority was read in this order: repository `AGENTS.md`,
[`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md),
the [M8-S1 design](../superpowers/specs/2026-08-26-m8-s1-mounted-on-skateboard-design.md),
the [latest Camera design](../superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md),
the [implementation plan](../superpowers/plans/2026-08-26-m8-s1-mounted-on-skateboard-implementation-plan.md),
the [Cursor Cloud full-gates prompt](../superpowers/skills/cursor-cloud/full-gates-prompt.md),
the [full-dimension review protocol](full-dimension-review-protocol.md), and the
[Runtime deep-review checklist](runtime-deep-review-checklist.md).

### Evidence-layer status

| Layer | Current evidence | Status |
| --- | --- | --- |
| `static-read` | Candidate diff, authority map, clean-break and Capture subreviews | Scoped reviews complete on their recorded inputs; final exact-SHA Claude/Grok review pending |
| `automated-contract` | Historical Cloud evidence plus current focused local Camera/Registry/Runtime/Viewer checks | New product candidate requires a fresh exact-SHA Cloud matrix before GO |
| `rendered-visual` | Four retained neutral-color frames from the formal mounted verifier | Inspected on the Runtime-equivalent `4c7551e` tree; see §4 |
| `manual-interaction` | No keyboard/mouse playtest performed | Not claimed and not required for the deterministic S1 completion claim |

## 2. Verification evidence

The local affected and mounted Capture evidence in the next subsection applies to candidate
`08f8f199e2751f80cf5aa25162bc00927425dfcd`. It remains useful historical evidence, but changes between that
commit and `7f9abd8bc78010cd0e04df8542d40f18c24bfae4` include package manifests, Capture implementation,
Capture tests and the mounted verifier. Therefore it is not relabeled as exact-current evidence.

### Local affected closure

- `pnpm exec vitest run scripts/lib/control-capture-bundle.test.ts scripts/lib/control-capture-validation.test.ts scripts/lib/simulation-take-cli.test.ts scripts/lib/simulation-take-runner.test.ts packages/validation/src/validation.test.ts`
  — exit 0; 5 files / 64 tests passed.
- Contracts/Compiler/Camera focused matrix — exit 0; 10 files / 508 tests passed. This retained summary is
  historical context; the current Cloud lineage below is the completion evidence.
- Runtime/Havok/Host focused matrix — exit 0; 15 files / 467 tests passed. This retained summary is historical
  context. A known Babylon NullEngine
  skeleton-uniform warning was observed; it is retained as environment evidence and is not described as
  hardware-rendering or performance evidence.
- `pnpm verify:control-capture` — exit 0; both verifier probes passed.
- `WORLDKIT_VERIFY_ARTIFACTS_DIR=/var/tmp/worldkit-m8-s1-exact-08f8f19 pnpm verify:mounted-skateboard-capture`
  — exit 0; the four-phase report is
  `/var/tmp/worldkit-m8-s1-exact-08f8f19/mounted-skateboard-capture-report.json`.
- Current support-projection and clean-break closure — exit 0; 6 focused files, 212 tests passed with 3
  platform skips. `pnpm verify:3c-migration` passes all 11 ledger rows with 41 remaining legacy references,
  and `pnpm verify:unreleased-clean-break` passes after removing the retired Viewer query route from active
  example evidence and adding a fail-closed route census.
- Latest repaired Camera epoch/bootstrap/replay regressions — exit 0; 12/12 targeted Runtime tests passed.
  The directly affected Runtime/Camera owner run reached 213/213 passing assertions across 3 files, then the
  local Vitest worker timed out while reporting `onTaskUpdate`; that command is not recorded as exit 0 and is
  not a substitute for the pending clean-environment Cloud aggregate. `pnpm typecheck` and
  `git diff --check` both pass on the same working tree.

### First exact-SHA Cloud attempt

- Cursor Cloud agent: `bc-b60819cf-e058-4aa1-a02e-38fc021a4757`.
- Run: `run-1642dd9b-1a77-413f-80c5-ca03c910dce2`.
- Model/profile: Grok 4.6, xhigh, fast.
- Target: exact product candidate `08f8f199e2751f80cf5aa25162bc00927425dfcd`.
- Final status for `08f8f199e2751f80cf5aa25162bc00927425dfcd`: **NO-GO**.
- `pnpm typecheck`: exit 2; 28 TypeScript errors in 4 files.
- `pnpm test`: did not reach the Vitest census; its workspace-boundary preflight blocked the aggregate.
- `pnpm build`: passed.
- `pnpm test:studio`: passed, 77/77.
- `pnpm test:independent`: passed, reported 23/23 plus 1/1.
- `pnpm verify:unreleased-clean-break`: passed, reported 1,518 checked and 0 violations.
- `pnpm verify:canonical`, `pnpm verify:placement-layout`, `pnpm verify:rigged-subject` and
  `pnpm verify:g-bot-subject`: passed.

These results are preserved as historical first-attempt evidence. They do not establish a final completion
tree. In particular, their build and capability results remain scoped to `08f8f199`; later changes touched
some of those inputs, so they are not silently promoted to `7f9abd8` evidence.

### Historical exact-SHA Cloud root closure

- Cursor Cloud agent: `bc-94b2272e-38ea-4525-971c-a817000e9cec`.
- Run: `run-512cffea-279d-45fd-ae83-9457ee381c26`.
- Target: exact candidate `7f9abd8bc78010cd0e04df8542d40f18c24bfae4`.
- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm typecheck`: exit 0.
- `pnpm test`: exit 0.
  - workspace-boundary preflight: passed with 49 registered debt entries across 1,760 public symbols;
  - fail-closed census: 386 files = 347 contract + 39 resource-heavy;
  - contract lane: 347 files, 4,150 passed, 3 platform skips, 0 failed;
  - resource-heavy lane: 39 files, 613 passed, 0 failed.

This was an exact-SHA GO for dependency installation, TypeScript and the root aggregate on `7f9abd8`. It
closed the first attempt's type/boundary/root blockers, but it does not cover the later Camera V2 clean break.

### Fresh-install non-root Cloud closure and D6 lineage

Cursor Cloud agent `bc-74b5577c-59da-4b4e-b2a0-3103f602894f`, run
`run-08af7359-9330-42ea-ae84-2b52dc2e182f`, checked exact SHA
`4c7551e3cee123df3767bda21e1cf72665dca457` after `pnpm install --frozen-lockfile` and reported:

- `pnpm typecheck`: exit 0;
- `pnpm build`: exit 0;
- `pnpm test:independent`: exit 0, 23/23 Node plus 1/1 Site;
- `pnpm verify:unreleased-clean-break`: exit 0, 1,519 scanned / 0 forbidden;
- `pnpm verify:control-capture`: exit 0, 2/2 probes;
- `pnpm verify:mounted-skateboard-capture`: exit 0 with the report summarized in §4;
- root `pnpm test`: exit 1 only because the newly added semantic-fact projector test was absent from the
  fail-closed census, so contract/resource-heavy execution did not start.

The two commits from `4c7551e` to historical candidate `7f9abd8` are test-only census/fixture corrections:
`94d415796992ceb6144860af34f0c99f05a4e869` classifies the semantic-fact projector test, and
`7f9abd8bc78010cd0e04df8542d40f18c24bfae4` aligns test expectations with the already-current Camera epoch
and regenerated Registry closure. They do not change production Runtime, Compiler, Registry, Capture,
build/dependency inputs or the formal verifier. Under the review protocol's D6 invalidation rule, the
`4c7551e` build, independent, clean-break and Capture results therefore remain applicable to the current
historical product tree, while the exact-`7f9abd8` root run proves the changed census and fixtures. This is
an explicit input analysis, not a claim that every command ran at `7f9abd8`. The current working tree changes
production Camera/Runtime/Registry contracts and generated artifacts, so this lineage stops at `7f9abd8`.

| Required lane | Evidence tree | Current status |
| --- | --- | --- |
| frozen install, typecheck, root aggregate | new exact product SHA | Pending Cloud run; `7f9abd8` result is historical |
| generated Planner/Builder bundle parity | new exact product SHA | Pending `pnpm check:agent-self-check`; focused source tests do not replace the final byte-parity gate |
| build, independent, unreleased clean break | new exact product SHA | Pending Cloud run; `4c7551e` lineage is historical |
| Control Capture and formal mounted Capture | new exact product SHA | Pending Cloud run because Camera/Viewer/Bootstrap inputs changed |
| Studio and Canonical/Placement/Rigged/G Bot capability gates | new exact product SHA | Pending Cloud run; `08f8f199` passes remain historical |
| documentation truth and final static review | final pushed review tree | Pending exact-SHA Claude/Grok reviews |

The historical `pnpm verify:outdoor-gameplay` command is intentionally absent. Its catalog Gameplay route was
deleted; current Gameplay runs only from Canonical Authoring JSON through `worldkit run`. The retired command
is superseded by the formal mounted verifier and current Canonical capability gates and must not be restored.

## 3. Old conclusion revalidation

| Prior conclusion | Current-tree status |
| --- | --- |
| The 2026-08-26 progress record was completion evidence | **Invalid.** It is now explicitly labeled a historical checkpoint. |
| Browser Protocol V5 had 39 keys | **Invalid.** The current exact surface is 38 keys; Snapshot V4 shape remains unchanged. |
| `CAM-MOUNT-1` belonged only to the later P2.4 Camera lane | **Superseded.** M8-S1 now owns and implements the narrow mounted seam; the broader GCC/P2.4 roadmap remains open. |
| Possession independently chose the Camera target | **Invalid under the latest contract.** Gameplay owns committed possession; Camera Director consumes same-epoch committed controlled Entity, selected Target and typed Relationship Context, and alone owns Camera publication. |
| Formal mounted Capture evidence remained open | **Invalid.** The retained 3+1 frame verifier passed locally on `08f8f199` and again in fresh-install Cloud on Runtime-equivalent `4c7551e`; D6 lineage to `7f9abd8` is explicit above. |
| The initial M8 design review proved the final implementation | **Invalid.** It approved the design SHA only and is not an exact-candidate code review. |

The design review used Claude agent `bc-ca733a91-a88d-437b-9545-0b34243f1964`, run
`run-9c2604f7-e87f-4c36-8177-01a17314b684`, against exact design SHA
`0f57d5c09b5ec93c6baab239ae318319b134dd96` and returned GO with no P0-P2 findings. An in-session Capture
subreview also informed the fixes, but has no durable external run identity and is treated only as advisory;
the formal Cloud verifier and tests above carry the Capture evidence weight. Neither substitutes for the
pending final exact-SHA Claude/Grok implementation reviews.

## 4. Formal Capture and rendered evidence

The fresh-install `4c7551e` Cloud verifier loaded a Host-fixed Canonical Authoring JSON source, produced
normalized World IR hash
`sha256:5b123fb89c34ffe054da555e8b6ffde52766faa8b95082367c2e6889786bb182`, and used committed Runtime
Snapshot as its Camera evidence source. Its pre-reset Bundle root is
`sha256:e722a7765c8570c3df2c5ae63a9fc8401de0f65e44926bb8e5522579bce6badc`: 3 frames, 2 Action rows,
14 Event rows and 6 Relationship rows. The post-reset Bundle root is
`sha256:61e326f10dd68a689842bac8996e301f5bf89bdbfb3d11a540cba72926dd56ee`: 1 frame and no
Action/Event/Relationship rows from the prior WorldSession.

| Phase | Committed evidence | Rendered inspection |
| --- | --- | --- |
| Before Mount | Tick 1, player controlled/targeted; player and skateboard facts present | Rider and board are separate |
| After Mount movement | Tick 31, skateboard controlled/targeted; mounted Camera modifier active | Rider stands aligned on the red board |
| After Dismount movement | Tick 61, player controlled/targeted; player begins a new fact episode after Dismount | Rider and board move separately |
| After Reset | Tick 0 in a new WorldSession; player controlled/targeted; no mounted state or prior journal leakage | Original Rider/board setup restored |

The retained Cloud report path was
`/tmp/worldkit-m8-s1-cloud-fresh-4c7551e/mounted-skateboard-capture-report.json`; its four neutral-color
frames were inspected for separation, mounted alignment, independent post-Dismount motion and Reset. This is
rendered-visual inspection, not manual interaction or a subjective control-feel claim.

## 5. Runtime authority and lifecycle review

| State | Sole authority | M8-S1 consumer/projection | Snapshot / reset / replay boundary |
| --- | --- | --- | --- |
| Relationship truth | GameplayState `relationshipStatesById` | Runtime projection, Browser, inspection, Capture | Typed committed state and journal; reset removes prior-session rows |
| Possession/control | GameplayState `possessedBy` | Input controlled Entity; Camera control context | WorldState/Receipt/Event agree atomically |
| Rider mounted pose | Committed Mount transform plus locked slot | Babylon Rider body/visual projection | Deterministic projection; no mesh-derived authority |
| Ground support | Each independently simulated Ground Subject's MotionKernel `checkSupport()` result | Board while mounted; Rider only after Dismount resumes its own Body tick; retained `supportedBy` projector | Reset/rollback clear stale fact episodes; no height-query fallback |
| Rider support while mounted | No independent support query | Suspended Rider projection | No fabricated Rider-board `supportedBy` fact |
| Active Action | Core Semantic Action plus trusted effect plan | Event/Receipt and immediate transition | Fixed-tick journal; no second Mount command handler |
| Camera | Camera Director | Same-epoch controlled Entity, selected Target and typed Relationship Context | Previous epoch remains coherent until next fixed-tick Camera publication |
| Simulation time/journal | RuntimeHost fixed-step transaction barrier | Snapshot, WorldState, Event, Receipt, Capture | Monotonic per WorldSession; post-reset foreign rows rejected |
| Resources | Explicit Runtime/adapter owners | Rider controller/body, Dismount probe, visuals | Partial construction and throwing cleanup covered by focused Runtime tests |

The reviewed architecture therefore keeps one owner per Gameplay, Physics, Camera and fixed-time state. It
does not infer Physics support from `mountedOn`, use Babylon Nodes to decide Camera Context, or retain a
second legacy relationship dialect.

### Camera V2 current-only clean break

- `@whitebox-world/camera` is the sole public owner and parser of `CameraContextRuleV2`; Runtime Contracts
  and Subject Registry import that contract directly and both reject malformed or legacy rule shapes.
- The unreleased `motionKernelRefs` and `requiredMotionTags` rule fields were deleted rather than translated
  into Camera tags. The public ViewTarget provider shell no longer carries Motion Kernel identity or tags.
- Catalog rules use only committed typed facts with authoritative producers. Mounted selection consumes the
  committed `mountedOn` Rider context; the former water, glide and surface-fast rules were removed because
  the current Runtime does not publish authoritative matching Camera facts.
- `renderFrame()` is presentation-only. The sole Tick-zero exception is the explicit Host bootstrap
  publication after committed initial binding; Playground, Native, isolated and Headless candidate readiness
  all pass the exact `viewStateRevision` before the first render. Reset and replacement repeat that same
  lifecycle instead of restoring render-time synchronization. The bootstrap operation is idempotent only
  before first render; render, fixed-Tick or Golden replay activity closes the phase.
- A committed bind, Mount or Dismount revision remains pending until the next fixed Tick. Preference,
  orbit, preview, preset tuning, Control Capture and artifact evidence fail closed in that interval, so no
  consumer can combine new Gameplay or geometry with an old Camera epoch.
- Golden rollback replays one ordered journal of fixed input, possession, Mount, Dismount and committed
  Camera authoring state. Its Tick-zero checkpoint includes Camera state, committed Context and per-Entity
  collision filters; Rider masks therefore cannot leak from Mount into support replay.
- Runtime validators, Planner/Builder self-check bundles, evidence worlds and the Native Cloud Ridge package
  were regenerated from the current contract. The latest repaired Camera epoch/bootstrap/replay target passes
  12/12; the directly affected self-check suite passes 1 file / 3 tests. The broader local owner run reached
  213/213 passing assertions but hit the reporting timeout recorded in §2, so only the pending Cloud aggregate
  may close the full gate. Generated Runtime validators, both agent self-check bundles and Native package bytes
  are current.
- Executable-source census for `CameraContextSampleV1`, `RetainedCharacterSupportSampleV1` and
  `MotionKernelLiveLockStateV1` is zero. The latter two were replaced by the current provider-neutral
  `CharacterSupportProjectionSampleV1` and `CharacterSupportProjectionLockV1`; `BodySampleV1` remains the
  Tick-bound movement authority and the projection does not perform a second support query. Their ledger
  rows remain `migrating`, not `completed`, until the owning legacy Motion Kernel module itself is removed.
  The whole `pnpm verify:3c-migration` command now passes locally.

## 6. Findings and current blockers

No P0-P2 product finding from the completed local Capture subreview is carried forward. The earlier
type/boundary/root blockers were closed on `7f9abd8`. Claude reviewed `d6d82c4` as GO, while Grok correctly
blocked it because render-time synchronization could publish a Mount/Dismount Camera epoch before the next
fixed Tick. The current working tree removes that path and closes the related bootstrap, replay and pending
evidence seams, but the repaired exact SHA must prove them again. The overall review remains **NO-GO**
for these unresolved completion items:

1. The new product tree has not yet been committed, pushed or exercised by the exact-SHA Cloud matrix.
2. Final exact-SHA Claude and Grok implementation reviews have not started.
3. The final Cloud run must repeat `pnpm check:agent-self-check` plus the current green 3C and Viewer-route
   clean-break gates on the frozen SHA.

The missing retired `verify:outdoor-gameplay` entry is not a finding and must not be repaired.

## 7. Acceptance and dimension coverage

| Acceptance claim | Current evidence | Status |
| --- | --- | --- |
| One canonical `mountedOn` schema/registry/compiler/runtime dialect | Focused contract/clean-break tests and scoped review | Current focused matrix passes; exact-product Cloud clean-break pending |
| Atomic Mount/Dismount, possession, Event, Receipt and WorldState | Runtime/Host focused matrix and Capture cross-binding | Locally supported |
| Per-active-body Physics authority and retained-support `supportedBy` | Runtime/Havok focused matrix | Board while mounted; Rider may start a new real support episode after Dismount |
| Deterministic safe Dismount and cleanup | Adversarial Runtime matrix | Locally supported |
| Latest same-epoch Camera contract and mounted modifier | Camera matrix plus committed Capture source | Locally supported; final review pending |
| Browser V5 remains exactly 38 keys | Focused contract matrix plus historical root aggregate | Current exact-product Cloud aggregate pending |
| Four-phase retained Capture and reset isolation | Historical formal verifier, report hashes and rendered frames | New exact-product Cloud verifier pending because Camera inputs changed |
| Internal Canonical capability completion | Whole gates plus exact-SHA dual review | **Pending / NO-GO** |
| Hosted Builder production exclusion | Builder self-check rejects relationships and package-local relationship capability refs | Focused RED→GREEN passes; bundled checker regenerated; Cloud aggregate pending |

| Dimension | Coverage | Evidence/status |
| --- | --- | --- |
| D1 positioning and scope | Checked | Narrow stand-ground skateboard slice only; broad vehicles/mounts remain non-claims |
| D2 Schema and AI-friendliness | Checked | One typed public term and role-qualified endpoints; final exact-SHA review pending |
| D3 claims versus implementation | Checked | README/spec/backlog/plan reconciled; root GO kept distinct from completion GO |
| D4 single authority | Checked | Authority map above and scoped Runtime/Capture review |
| D5 engineering quality | Checked | Determinism, adversarial transitions, isolation and cleanup covered locally; new Cloud aggregate pending |
| D6 gates and evidence layers | Open | Historical evidence is retained but not promoted across the production Camera clean break |

## 8. Explicit non-claims

M8-S1 does not claim seat/tether relationships, wheel dynamics, tricks, general vehicle or mount dynamics,
dynamic Route, Hosted Builder admission, first-person or multi-camera production support, the broad GCC
Runtime/Kit/Fixture roadmap, Capture resume/video adapters, manual interaction, hardware-renderer performance,
or subjective production-ready control feel. The unreleased project uses a current-only clean break; no legacy
relationship, Camera or catalog Gameplay compatibility path is required.

## 9. Remaining closure work

1. Commit and push the new product candidate, then use the shared full-gates prompt and run frozen install,
   `pnpm check:agent-self-check`, typecheck, root test, build, Studio, independent, clean-break, Canonical
   capability, Viewer and mounted Capture gates in Cursor Cloud.
2. Dispatch independent Claude and Grok deep code reviews against the same exact pushed review tree;
   reproduce and disposition every P0/P1 before acceptance and batch/defer non-blocking P2/P3 as the
   protocol permits.
3. Disposition review findings, update the final evidence and only then mark the M8 backlog row
   complete. Later documentation-only truth corrections require diff/link checks, not Runtime or whole-suite
   replay.
