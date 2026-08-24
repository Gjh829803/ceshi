# Gameplay Bootstrap / ExecutionPlanV5 G19-4 Review Disposition

## Review metadata

- Review mode: full-dimension protocol Mode B change review.
- Integration branch: `codex/pr19-gameplay-main-integration-v2`.
- Starting checkpoint: `2afef92` plus the G19-4 candidate working tree reviewed here.
- Scope: ExecutionPlanV5, Gameplay Bootstrap semantic identity, WorldPackage closure and membership,
  Compiler composition, Validation replay, RuntimeHost pre-adapter admission, migrated Babylon/Route/
  Playground callers, example Take world identity and required verification gates.
- Explicitly excluded: G19-5 Babylon Gameplay transaction, G19-6 Browser Gameplay API, G19-7 Outdoor/
  CLI production wiring, new Camera algorithms, physics behavior, relationship slices and public `goTo`.
- Protocols applied: `full-dimension-review-protocol.md` dimensions D2-D6 and the runtime deep-review
  checklist for touched RuntimeHost/Babylon boundaries.

## Outcome

**GO for the closed G19-4 integration slice.** No confirmed P0/P1/P2 finding remains open. This outcome
does not approve the still-unimplemented G19-5 through G19-8 product path.

## Authority and compatibility disposition

- `ExecutionPlanV5` is parsed once by the runtime-contracts authority, is exact-key and deeply frozen.
- `initialControlledEntityId` is the only clean-break field for the initial possession candidate.
- Gameplay Bootstrap has a canonical semantic hash distinct from its WorldPackage artifact byte hash.
- The Plan resource lock contains exactly one full Bootstrap lock in addition to the Normalized IR base
  lock; WorldPackage manifest, integrity, build closure, receipt and Plan agree on membership.
- RuntimeHost validates Plan and Bootstrap membership before creating an Adapter, so rejected input has no
  runtime side effect.
- Babylon temporarily projects V5 into the existing V4 runtime boundary without adding a second gameplay,
  support, medium, facing, camera or fixed-tick owner. G19-5 owns the later transactional Gameplay Port.
- Route receipts bind to the complete Plan resource lock. Route V2/R1b Surface semantics and provider-
  neutral public evidence remain unchanged.

## Findings and dispositions

### G19-4-F1 — stale example Take WorldPackage root — confirmed / fixed

The first Control Capture run exposed both example Takes carrying an obsolete WorldPackage root. Manually
editing generated hashes would leave the failure recurring, so the fix adds `generate:example-takes` and a
focused generator test. The command snapshots the current canonical identity and atomically writes both
Take documents. `verify:control-capture` now passes with root
`sha256:28f3d9b5aed02250909e5a2e2af8a7d1c13b9127038ab8163a1475da0e9ee073`.

### G19-4-F2 — Compiler V5 could invoke untrusted accessors — confirmed / fixed

A failing regression proved `compileWorldV5` read an accessor before validating input purity. The Compiler
now recursively rejects accessor properties and symbol keys without invocation, snapshots with
`structuredClone`, and performs every semantic read against that snapshot. Stable diagnostics distinguish
forbidden accessors from invalid snapshot input.

### G19-4-F3 — full-suite Route browser timeout budget — confirmed infrastructure issue / fixed

`worldkit-route-run` and `route-validation-runner` passed serially but exceeded their old 75/120 second
budgets under full parallel load. Runtime assertions and production code were unchanged; only the test
budgets were raised to cover measured browser/Havok contention. The final parallel full suite passes,
including the browser Route test at about 94.6 seconds.

## Required dimension coverage

| Dimension | Disposition |
| --- | --- |
| D2 public naming and AI friendliness | Clean-break `initialControlledEntityId`; no aliases or provider terms added to public Schema, CLI, Browser, Report or Snapshot. |
| D3 documentation and examples | Progress and implementation plan now reflect G19-4 completion; example Takes are generated from canonical identity instead of hand-maintained hashes. |
| D4 semantic contracts and determinism | Bootstrap semantic/artifact hashes remain separate; six-way membership and pre-adapter admission are covered by adversarial tests. |
| D5 dependency and implementation quality | Direct dependencies are declared; strict comparisons and `isNil` conventions are preserved; Compiler input is snapshotted before reads. |
| D6 verification and operations | Full suite, build and all required Canonical/Placement/Subject/Capture/Route gates pass. Existing Vite large-chunk output remains an advisory, not a new failure. |

## Executable evidence

- `pnpm typecheck` — passed.
- `pnpm test` — 165 files / 2,079 tests passed.
- `pnpm build` — passed; only the existing Vite large-chunk advisory remains.
- `pnpm verify:canonical` — passed.
- `pnpm verify:placement-layout` — passed.
- `pnpm verify:rigged-subject` — passed.
- `pnpm verify:g-bot-subject` — passed.
- `pnpm verify:control-capture` — passed for both generated example Takes.
- `pnpm verify:validation-capture` — passed, including the expected adversarial failures.
- `pnpm verify:route-r0-contract` — passed.
- `pnpm verify:route-r1-heightfield` — passed with 11 fixtures and deterministic 30/60/120-like evidence.
- `pnpm verify:route-r1b-static-platform` — passed with 11 fixtures, zero legacy consumer matches and zero provider identity leaks.
- `git diff --check` — passed before the documentation disposition.

## Next boundary

G19-5 may now begin. It must make committed `possessedBy` the sole control target and stage Babylon
Control/Action/Camera projection as one transaction. It must not expose Gameplay through Browser V5 or
Outdoor/CLI until G19-6/G19-7 own those entry points.
