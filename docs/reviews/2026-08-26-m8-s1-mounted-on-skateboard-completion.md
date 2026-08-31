# M8-S1 `mountedOn` Human-Skateboard Completion Review

> **Draft / NO-GO.** Current candidate `7f9abd8bc78010cd0e04df8542d40f18c24bfae4` has an exact-SHA
> Cloud **GO** for install, typecheck and the complete root test aggregate. The first `08f8f199` attempt and
> its failure remain recorded below as history. Final independent Claude and Grok code reviews have not
> started, so no M8-S1 completion GO is claimed.
> This document must not be converted to a completion GO until those results are recorded and every blocking
> finding is dispositioned against the final candidate.

## 1. Review metadata

| Field | Value |
| --- | --- |
| Date | 2026-09-01 |
| Review mode | Mode B change review plus the complete Runtime deep-review checklist |
| Product candidate | `7f9abd8bc78010cd0e04df8542d40f18c24bfae4` |
| Diff base | `df2dcd53434bd26a97dbb3e835fb99ad56eb82a9` |
| Branch | `codex/m8-s1-completion` |
| Runtime dependencies | Babylon.js `9.23.0`; Havok `1.3.14` |
| Scope | Strict `mountedOn` contract, atomic Mount/Dismount, possession transfer, Rider projection, safe Dismount, retained-Physics `supportedBy`, narrow mounted Camera seam, complete Capture journal and formal four-phase verifier |
| Current disposition | **Cloud root gates GO; overall NO-GO pending final exact-SHA Claude/Grok review** |

Authority was read in this order: repository `AGENTS.md`,
[`docs/18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md),
the [M8-S1 design](../superpowers/specs/2026-08-26-m8-s1-mounted-on-skateboard-design.md),
the [latest Camera design](../superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md),
the [implementation plan](../superpowers/plans/2026-08-26-m8-s1-mounted-on-skateboard-implementation-plan.md),
the [full-dimension review protocol](full-dimension-review-protocol.md), and the
[Runtime deep-review checklist](runtime-deep-review-checklist.md).

### Evidence-layer status

| Layer | Current evidence | Status |
| --- | --- | --- |
| `static-read` | Candidate diff, authority map, clean-break and Capture subreviews | Scoped reviews complete on their recorded inputs; final exact-SHA Claude/Grok review pending |
| `automated-contract` | Historical local affected evidence, fresh-install `4c7551e` non-root closure and exact-`7f9abd8` root closure | Current affected gates are closed through the D6 lineage below; final review pending |
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

### Current exact-SHA Cloud root closure

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

This is an exact-SHA GO for dependency installation, TypeScript and the root aggregate. It closes the first
attempt's type/boundary/root blockers.

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

The two commits after `4c7551e` are documentation plus test-only census/fixture corrections:
`94d415796992ceb6144860af34f0c99f05a4e869` classifies the semantic-fact projector test, and
`7f9abd8bc78010cd0e04df8542d40f18c24bfae4` aligns test expectations with the already-current Camera epoch
and regenerated Registry closure. They do not change production Runtime, Compiler, Registry, Capture,
build/dependency inputs or the formal verifier. Under the review protocol's D6 invalidation rule, the
`4c7551e` build, independent, clean-break and Capture results therefore remain applicable to the current
product tree, while the exact-`7f9abd8` root run proves the changed census and fixtures. This is an explicit
input analysis, not a claim that every command ran at `7f9abd8`.

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
`0f57d5c09b5ec93c6baab239ae318319b134dd96` and returned GO with no P0-P2 findings. A separate Capture
subreview returned GO with no P0-P3 findings, passed its 23/23 focused and tamper matrix, and confirmed full
journal-segment, Snapshot/WorldState/inspection cross-binding and reset isolation. Those are useful scoped
reviews; neither substitutes for the pending final exact-SHA Claude/Grok implementation reviews.

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
| Ground support | Mount MotionKernel `checkSupport()` result | Ground mode and retained `supportedBy` projector | Reset/rollback clear stale fact episodes; no height-query fallback |
| Rider support while mounted | No independent support query | Suspended Rider projection | No fabricated Rider-board `supportedBy` fact |
| Active Action | Core Semantic Action plus trusted effect plan | Event/Receipt and immediate transition | Fixed-tick journal; no second Mount command handler |
| Camera | Camera Director | Same-epoch controlled Entity, selected Target and typed Relationship Context | Previous epoch remains coherent until next fixed-tick Camera publication |
| Simulation time/journal | RuntimeHost fixed-step transaction barrier | Snapshot, WorldState, Event, Receipt, Capture | Monotonic per WorldSession; post-reset foreign rows rejected |
| Resources | Explicit Runtime/adapter owners | Rider controller/body, Dismount probe, visuals | Partial construction and throwing cleanup covered by focused Runtime tests |

The reviewed architecture therefore keeps one owner per Gameplay, Physics, Camera and fixed-time state. It
does not infer Physics support from `mountedOn`, use Babylon Nodes to decide Camera Context, or retain a
second legacy relationship dialect.

## 6. Findings and current blockers

No P0-P2 product finding from the completed local Capture subreview is carried forward. The earlier
type/boundary/root blockers are closed by the exact-`7f9abd8` Cloud run. The overall review remains **NO-GO**
for these unresolved completion items:

1. Final exact-SHA Claude and Grok implementation reviews have not started.
2. The final reviewers must validate the D6 lineage above, including that `94d4157` and `7f9abd8` are
   test/documentation-only for the reused `4c7551e` build, clean-break and Capture inputs.

The missing retired `verify:outdoor-gameplay` entry is not a finding and must not be repaired.

## 7. Acceptance and dimension coverage

| Acceptance claim | Current evidence | Status |
| --- | --- | --- |
| One canonical `mountedOn` schema/registry/compiler/runtime dialect | Focused contract/clean-break tests and scoped review | Root aggregate passes on `7f9abd8`; Runtime-equivalent `4c7551e` clean-break is 1,519/0 |
| Atomic Mount/Dismount, possession, Event, Receipt and WorldState | Runtime/Host focused matrix and Capture cross-binding | Locally supported |
| Board-only Physics authority and retained-support `supportedBy` | Runtime/Havok focused matrix | Locally supported |
| Deterministic safe Dismount and cleanup | Adversarial Runtime matrix | Locally supported |
| Latest same-epoch Camera contract and mounted modifier | Camera matrix plus committed Capture source | Locally supported; final review pending |
| Browser V5 remains exactly 38 keys | Focused contract matrix plus root aggregate | Root aggregate passes on `7f9abd8` |
| Four-phase retained Capture and reset isolation | Formal verifier, report hashes and rendered frames | Runtime-equivalent `4c7551e` verifier and D6 lineage pass; final review pending |
| Production completion | Whole gates plus exact-SHA dual review | **Pending / NO-GO** |

| Dimension | Coverage | Evidence/status |
| --- | --- | --- |
| D1 positioning and scope | Checked | Narrow stand-ground skateboard slice only; broad vehicles/mounts remain non-claims |
| D2 Schema and AI-friendliness | Checked | One typed public term and role-qualified endpoints; final exact-SHA review pending |
| D3 claims versus implementation | Checked | README/spec/backlog/plan reconciled; root GO kept distinct from completion GO |
| D4 single authority | Checked | Authority map above and scoped Runtime/Capture review |
| D5 engineering quality | Checked | Determinism, adversarial transitions, isolation and cleanup covered; exact-`7f9abd8` root aggregate GO |
| D6 gates and evidence layers | Partially closed | Exact-`7f9abd8` root GO plus explicit `4c7551e` unaffected-input lineage; final dual review pending |

## 8. Explicit non-claims

M8-S1 does not claim seat/tether relationships, wheel dynamics, tricks, general vehicle or mount dynamics,
dynamic Route, Hosted Builder admission, first-person or multi-camera production support, the broad GCC
Runtime/Kit/Fixture roadmap, Capture resume/video adapters, manual interaction, hardware-renderer performance,
or subjective production-ready control feel. The unreleased project uses a current-only clean break; no legacy
relationship, Camera or catalog Gameplay compatibility path is required.

## 9. Remaining closure work

1. Dispatch independent Claude and Grok deep code reviews against exact candidate
   `7f9abd8bc78010cd0e04df8542d40f18c24bfae4`; reproduce and
   disposition every P0/P1 before acceptance and batch/defer non-blocking P2/P3 as the protocol permits.
2. Disposition review findings, update the final evidence and only then mark the M8 backlog row
   complete. Later documentation-only truth corrections require diff/link checks, not Runtime or whole-suite
   replay.
