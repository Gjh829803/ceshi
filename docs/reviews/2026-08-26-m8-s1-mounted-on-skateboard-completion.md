# M8-S1 `mountedOn` Human-Skateboard Completion Review

> **Draft / NO-GO.** The product implementation and local affected evidence below target exact commit
> `08f8f199e2751f80cf5aa25162bc00927425dfcd`. Its exact-SHA Cloud gate run completed **NO-GO**:
> `pnpm typecheck` found 28 errors in 4 files and root `pnpm test` stopped in the workspace-boundary preflight
> before census. Type/boundary fixes and a replacement candidate are in progress. Final independent Claude
> and Grok code reviews have not started.
> This document must not be converted to a completion GO until those results are recorded and every blocking
> finding is dispositioned against the final candidate.

## 1. Review metadata

| Field | Value |
| --- | --- |
| Date | 2026-09-01 |
| Review mode | Mode B change review plus the complete Runtime deep-review checklist |
| Product candidate | `08f8f199e2751f80cf5aa25162bc00927425dfcd` |
| Diff base | `df2dcd53434bd26a97dbb3e835fb99ad56eb82a9` |
| Branch | `codex/m8-s1-completion` |
| Runtime dependencies | Babylon.js `9.23.0`; Havok `1.3.14` |
| Scope | Strict `mountedOn` contract, atomic Mount/Dismount, possession transfer, Rider projection, safe Dismount, retained-Physics `supportedBy`, narrow mounted Camera seam, complete Capture journal and formal four-phase verifier |
| Current disposition | **NO-GO pending a replacement exact-SHA Cloud closure and final dual review** |

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
| `static-read` | Candidate diff, authority map, clean-break and Capture subreviews | Local review complete; final exact-SHA Claude/Grok review pending |
| `automated-contract` | Three local affected matrices, Control Capture verifier, formal mounted verifier and first Cloud attempt | Local affected evidence passes; first Cloud attempt is NO-GO and replacement closure is pending |
| `rendered-visual` | Four retained neutral-color frames from the formal mounted verifier | Inspected; see §4 |
| `manual-interaction` | No keyboard/mouse playtest performed | Not claimed and not required for the deterministic S1 completion claim |

## 2. Verification evidence

All local evidence in this section applies to product candidate `08f8f199e2751f80cf5aa25162bc00927425dfcd`.
The documentation-only edits that create this draft do not invalidate those Runtime inputs.

### Local affected closure

- `pnpm exec vitest run scripts/lib/control-capture-bundle.test.ts scripts/lib/control-capture-validation.test.ts scripts/lib/simulation-take-cli.test.ts scripts/lib/simulation-take-runner.test.ts packages/validation/src/validation.test.ts`
  — exit 0; 5 files / 64 tests passed.
- Contracts/Compiler/Camera focused matrix — exit 0; 10 files / 508 tests passed. The exact command must be
  copied from the retained execution transcript before this draft becomes final evidence.
- Runtime/Havok/Host focused matrix — exit 0; 15 files / 467 tests passed. The exact command must be copied
  from the retained execution transcript before this draft becomes final evidence. A known Babylon NullEngine
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
tree: type/boundary fixes are in progress, and the affected evidence must be selected and rerun against the
replacement exact SHA before acceptance.

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
| Formal mounted Capture evidence remained open | **Invalid for the product candidate.** The retained 3+1 frame verifier passes locally; Cloud and final code-review closure remain open. |
| The initial M8 design review proved the final implementation | **Invalid.** It approved the design SHA only and is not an exact-candidate code review. |

The design review used Claude agent `bc-ca733a91-a88d-437b-9545-0b34243f1964`, run
`run-9c2604f7-e87f-4c36-8177-01a17314b684`, against exact design SHA
`0f57d5c09b5ec93c6baab239ae318319b134dd96` and returned GO with no P0-P2 findings. A separate Capture
subreview returned GO with no P0-P3 findings, passed its 23/23 focused and tamper matrix, and confirmed full
journal-segment, Snapshot/WorldState/inspection cross-binding and reset isolation. Those are useful scoped
reviews; neither substitutes for the pending final exact-SHA Claude/Grok implementation reviews.

## 4. Formal Capture and rendered evidence

The retained pre-reset Bundle root is
`sha256:7e9af2bf5b10cdd129b6580510014787b5546829af277b18325a69b7fe0d38c4`: 3 frames, 2 Action rows,
14 Event rows and 6 Relationship rows. The post-reset Bundle root is
`sha256:bf9fa9e9c03df53cafb7e7674c45aa228491c95dc95c05c3b2a13b52391ec718`: 1 frame and no
Action/Event/Relationship rows from the prior WorldSession.

| Phase | Committed evidence | Rendered inspection |
| --- | --- | --- |
| Before Mount | Tick 1, player controlled/targeted; player and skateboard facts present | Rider and board are separate |
| After Mount movement | Tick 31, skateboard controlled/targeted; mounted Camera modifier active | Rider stands aligned on the red board |
| After Dismount movement | Tick 61, player controlled/targeted; player begins a new fact episode after Dismount | Rider and board move separately |
| After Reset | Tick 0 in a new WorldSession; player controlled/targeted; no mounted state or prior journal leakage | Original Rider/board setup restored |

The four inspected files are the `neutral-color.png` frames under
`/var/tmp/worldkit-m8-s1-exact-08f8f19/pre-reset.bundle/frames/000000`, `000001`, `000002`, and
`/var/tmp/worldkit-m8-s1-exact-08f8f19/post-reset.bundle/frames/000000`. This is retained rendered-visual
inspection, not manual interaction or a subjective control-feel claim. The report identifies committed Runtime
Snapshot as the Camera evidence source.

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

No P0-P2 product finding from the completed local Capture subreview is carried forward. The overall review is
nevertheless **NO-GO** for these unresolved completion blockers:

1. The first exact-candidate Cloud run failed: `pnpm typecheck` has 28 errors in 4 files and root `pnpm test`
   was blocked by workspace boundaries before census. The in-progress fixes require a replacement exact SHA
   and the appropriately invalidated gates to pass before any GO.
2. Final exact-SHA Claude and Grok implementation reviews have not started.
3. The exact command lines for the 10-file and 15-file local matrices must be copied into this record from the
   retained transcripts; summary counts alone do not satisfy the final D6 evidence standard.

The missing retired `verify:outdoor-gameplay` entry is not a finding and must not be repaired.

## 7. Acceptance and dimension coverage

| Acceptance claim | Current evidence | Status |
| --- | --- | --- |
| One canonical `mountedOn` schema/registry/compiler/runtime dialect | Focused contract/clean-break tests and scoped review | First Cloud clean-break gate passed; replacement-tree closure pending |
| Atomic Mount/Dismount, possession, Event, Receipt and WorldState | Runtime/Host focused matrix and Capture cross-binding | Locally supported |
| Board-only Physics authority and retained-support `supportedBy` | Runtime/Havok focused matrix | Locally supported |
| Deterministic safe Dismount and cleanup | Adversarial Runtime matrix | Locally supported |
| Latest same-epoch Camera contract and mounted modifier | Camera matrix plus committed Capture source | Locally supported; final review pending |
| Browser V5 remains exactly 38 keys | Focused contract matrix | Locally supported; first Cloud aggregate was boundary-blocked |
| Four-phase retained Capture and reset isolation | Formal verifier, report hashes and rendered frames | Passed locally |
| Production completion | Whole gates plus exact-SHA dual review | **Pending / NO-GO** |

| Dimension | Coverage | Evidence/status |
| --- | --- | --- |
| D1 positioning and scope | Checked | Narrow stand-ground skateboard slice only; broad vehicles/mounts remain non-claims |
| D2 Schema and AI-friendliness | Checked | One typed public term and role-qualified endpoints; final exact-SHA review pending |
| D3 claims versus implementation | Checked | README/spec/backlog/plan reconciled; Cloud completion claims withheld |
| D4 single authority | Checked | Authority map above and scoped Runtime/Capture review |
| D5 engineering quality | Checked locally | Determinism, adversarial transitions, isolation and cleanup covered; aggregate Cloud result pending |
| D6 gates and evidence layers | Partially closed | Local evidence and first Cloud results recorded; replacement Cloud closure and independent final reviews pending |

## 8. Explicit non-claims

M8-S1 does not claim seat/tether relationships, wheel dynamics, tricks, general vehicle or mount dynamics,
dynamic Route, Hosted Builder admission, first-person or multi-camera production support, the broad GCC
Runtime/Kit/Fixture roadmap, Capture resume/video adapters, manual interaction, hardware-renderer performance,
or subjective production-ready control feel. The unreleased project uses a current-only clean break; no legacy
relationship, Camera or catalog Gameplay compatibility path is required.

## 9. Remaining closure work

1. Finish diagnosis of the Cloud `typecheck` exit 2. If a product edit is required, freeze a new exact SHA and
   rerun only the evidence invalidated by that edit before one final Cloud closure.
2. Record every Cloud command, exit code, count, warning and artifact against the exact final SHA.
3. Dispatch independent Claude and Grok deep code reviews against that same final SHA; reproduce and
   disposition every P0/P1 before acceptance and batch/defer non-blocking P2/P3 as the protocol permits.
4. Replace this draft's transcript placeholders, update the disposition and only then mark the M8 backlog row
   complete. Later documentation-only truth corrections require diff/link checks, not Runtime or whole-suite
   replay.
