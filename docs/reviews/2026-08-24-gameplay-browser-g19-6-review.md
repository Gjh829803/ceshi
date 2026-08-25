# G19-6 Browser Gameplay Cutover Review Disposition

## Review metadata

- Date: 2026-08-24
- Branch: `codex/g19-6-browser-gameplay`
- Baseline: `main@1df2facde449540388a8b0967c27710e948c00d5`
- Last committed implementation inspected: `fbd4caca8976b7c514519fae83dbd976bf60c500`
- Candidate scope: committed G19-6 foundations plus the final consumer-cutover working tree
- Review mode: Mode B change review plus the applicable Runtime deep-review dimensions
- Authoritative checklists for final closure:
  [`full-dimension-review-protocol.md`](full-dimension-review-protocol.md) and
  [`runtime-deep-review-checklist.md`](runtime-deep-review-checklist.md)

## Scope and outcome

The G19-6 implementation candidate now connects the provider-neutral Gameplay authority to the public
Browser and existing automation consumers without introducing a second control or time authority:

1. `WorldkitBrowserApiV5` is an exact 39-key public surface. It includes Gameplay command, event,
   inspection, World State and Runtime Activity methods and excludes `bindControl`.
2. `WorldRuntimeSnapshotV4` is the only public Runtime snapshot used by the migrated consumers. Control
   truth is read from `world.gameplayInspection.possessedByRelationshipsById`; no root
   `controlledEntityId` is published.
3. `GameplayBabylonRuntimeCoordinator` owns the RuntimeHost ↔ Babylon world boundary, Session-scoped
   world/canvas replacement, initial canonical bind and provider-neutral Snapshot projection.
4. Reset/rebind uses the RuntimeHost mutation boundary and does not treat
   `initialControlledEntityId` as an ongoing fallback owner.
5. Runtime Activity is exposed through exact acquire/release requests and receipts. A standalone control
   capture takes a short `control-capture` activity; Simulation Take owns an outer `simulation-take`
   activity and releases it on the failure path.
6. Authoring loader and the CLI WorldKit pipeline share the same locked Gameplay bootstrap construction.
   Control Capture, Simulation Take, WorldKit CLI and the Canonical/Placement/Rigged/G Bot browser
   verifiers consume Snapshot V4 and bind through `executeGameplayCommand(control.bind)`.
7. The internal Babylon V3 capture projection remains a private adapter ABI only. It is not a Canonical,
   Browser, CLI, Capture Bundle, Report or public Snapshot contract.
8. Every `ExecutionSubjectV3` now carries a required, locked `locomotionCapabilityRef` and
   `locomotionCapabilityHash`. The Definition normalizer selects the primary locomotion Capability as the
   unique dependency leaf of the selected `locomotion.*` Capability subgraph: it removes nodes required by
   another selected locomotion Capability and rejects zero or multiple remaining nodes. The Definition
   freezes that Ref/Hash; Compiler and Runtime validate/project it rather than guessing `ground`.
9. Babylon projects one Canonical `locomotion-capability-state` per Subject into
   `capabilityStatesById`, including the owner, locked Capability identity, locomotion mode, movement
   medium, facing and speed. This replaces verifier dependence on V3 `activeActionId` state.
10. Placement verification now exercises Authoring/Normalized IR V4, ExecutionPlan V5, Snapshot V4 and
    Browser V5 as one chain. Rigged and G Bot browser gates await asynchronous reset/commands inside the
    browser realm and keep Node-only assertion helpers outside `page.evaluate`.
11. Subject Asset resolution and byte/hash validation happen while constructing the locked Runtime World
    Configuration. A failure at that public Authoring startup boundary is reported as
    `AUTHORING_RUNTIME_CONFIGURATION_INVALID`; provider-specific asset errors do not become a new public
    protocol dialect.
12. Fixed-input execution restores the caller's prior pause state in `finally`, including thrown input
    execution, so a failed deterministic input batch cannot strand the Runtime in its temporary pause.

Disposition: **Final GO; merge-ready, not yet merged**. The candidate matches the frozen ownership and
AI-facing naming rules. G19-6 may be integrated independently before G19-7 because its Browser/Snapshot,
Runtime Activity and consumer-cutover boundary is closed and backward dependencies point only to G19-5.

## Contract disposition

| Concern | Candidate disposition | Closure evidence still required |
| --- | --- | --- |
| Browser exact surface | 39 mandatory enumerable keys; no public `bindControl` or V4 alias | Fresh runtime-contracts/browser-api exact-key tests |
| Control authority | `possessedBy` Relationship is the only public truth | Reset/rebind and multi-instance Browser regressions |
| Snapshot authority | Public consumers use Snapshot V4 World/View/Runtime/Resources envelope | Full consumer census and Canonical verifier |
| Runtime lifecycle | Host owns world replacement; coordinator owns Babylon candidate/active swap | Pending capture/reset and throwing-cleanup adversarial review |
| Activity/capture | Host Activity gates Capture and Take; request/session identity is exact | Failure-path, late release, reset/replace concurrency tests |
| Time | Babylon fixed simulation Tick remains authoritative | Take/Capture and 30/60/120-like review evidence |
| Provider boundary | Babylon/Havok names and handles stay behind adapters | Public schema/CLI/Browser/Report search in final review |
| Consumer cutover | Authoring, CLI pipeline, Capture, Take and four existing verifiers migrated | Fresh focused tests and all relevant real Browser gates |
| Execution Subject capability identity | Required locomotion Capability Ref/Hash come from one locked Capability row | ExecutionPlan/Compiler exact-key and missing/mismatched lock tests |
| Canonical capability state | Babylon publishes `locomotion-capability-state`; UI/verifiers read Snapshot V4 capability state | Runtime projection and Canonical parser/hash regressions |
| Placement contract chain | Verifier uses Authoring/IR V4 → Plan V5 → Snapshot V4/Browser V5 | Fresh `verify:placement-layout` evidence |
| Rigged/G Bot browser boundary | Async reset/command is awaited in-browser; Node helpers only inspect returned data | Fresh Rigged/G Bot Chromium gates |
| Build-stage asset failure | Locked Runtime configuration construction fails closed at the Authoring public boundary | Asset-tamper Browser regression and unchanged committed asset bytes |
| Fixed-input pause lifecycle | Temporary pause is restored in `finally` | Focused thrown-input pause restoration test |

## Final verification evidence

- `pnpm typecheck`: passed.
- Final `pnpm test`: 168 files / 2,134 tests passed. The prior first-run Canonical golden mismatch was
  resolved by regenerating the expected bytes after the new locked locomotion Capability fields changed
  canonical identity.
- `pnpm build`: passed.
- `pnpm verify:canonical`: passed.
- `pnpm verify:placement-layout`: passed.
- `pnpm verify:rigged-subject`: passed.
- `pnpm verify:g-bot-subject`: passed.
- `pnpm verify:route-r0-contract`: passed.
- `pnpm verify:route-r1-heightfield`: passed.
- `pnpm verify:route-r1b-static-platform`: passed.
- `pnpm verify:control-capture`: passed; both example Takes produced and validated all five Capture passes.
- `pnpm verify:validation-capture`: passed; five positive/adversarial cases produced the expected outcome.

Focused Browser/coordinator/runtime-contract coverage passed 58/58 tests. Focused Control Capture /
Simulation Take coverage passed 50/50 tests, and the Capture bundle/Take subset passed 13/13 tests.

Accepted build warnings are limited to the existing Vite large-chunk advisory. Babylon NullEngine skeleton
uniform warnings and the existing Rapier initialization deprecation appeared only in test output and did
not fail a contract or rendered Browser gate.

## Review findings and disposition

The completion review confirmed and fixed these issues before the final matrix:

1. Runtime locomotion identity was inferred as `ground`; it is now a required Definition/Plan lock chosen
   as the unique selected locomotion dependency leaf and projected without Runtime guessing.
2. Browser V5 retained optional adapter fallbacks after the adapter methods became mandatory; the stale
   alternate path and its fabricated test were removed.
3. The Playground coordinator published a fabricated Controller hash; it now hashes the frozen local
   Controller definition body.
4. Capture Bundle ownership checked Runtime Session but not World Session; both identities are now exact.
5. Control/Validation Capture verification still crossed the V3 pipeline/snapshot boundary; both gates now
   exercise Authoring V4, Plan V5, Browser V5 and Snapshot V4.

No confirmed P0/P1/P2 finding remains open.

| Dimension | Disposition |
| --- | --- |
| D1 Security/trust | No new external trust or provider handle surface; fail-closed parsing retained. |
| D2 Correctness | Exact-key, Session ownership, reset/rebind, pause restoration and capture failure paths covered. |
| D3 Concurrency/lifecycle | Candidate swap, Activity acquisition/release, reset blocking and throwing cleanup covered. |
| D4 Schema/evolution | Clean break to Browser V5 / Snapshot V4; no public V3 alias or provider terminology. |
| D5 Architecture | RuntimeHost owns canonical state; Babylon remains an adapter; `possessedBy` is sole control truth. |
| D6 Tests/observability | Focused tests, full suite, real Browser/Havok gates and Capture artifacts all passed. |

## Explicitly outside G19-6

- G19-7 Outdoor/catalog route plus page/artifact lifecycle and six-scene production Browser gate.
- G19-8 end-to-end completion review, final disposition and main integration.
- Action Presentation, multiple Controller input scheduling and broader Camera Context/Preference behavior;
  none is implied by this slice.

## Reproduction commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
pnpm verify:control-capture
pnpm verify:validation-capture
pnpm verify:route-r0-contract
pnpm verify:route-r1-heightfield
pnpm verify:route-r1b-static-platform
```

## Final gate record

Status: **Final GO; merge-ready, not yet merged**.

- Automated contract evidence: typecheck, 168 files / 2,134 tests and all required verifier commands passed.
- Real Browser/Runtime evidence: Canonical, Placement, Rigged, G Bot, Route and five-pass Capture gates passed.
- Manual interaction evidence: not required for this protocol/consumer cutover slice; G19-7 owns the six-scene
  production interaction gate.
- Public boundary census: no V3 control alias or Babylon/Havok/provider handle leaks into Browser, CLI,
  Capture, Report or Snapshot contracts.
