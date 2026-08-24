# Route R1b PR #24 Fix Disposition

## Review boundary

- Reviewed base: PR #24 snapshot `a0c6dc418763986af093937471da34d60e8bcf5e`.
- Repair branch: `codex/pr24-review-fixes`.
- Authority: R1b frozen design and implementation plan dated 2026-08-23.
- Scope: contract and Task 4 correctness gaps already present in PR #24.
- Explicitly excluded: R1b Tasks 5–10 implementation, Runtime/physics/camera changes, NPCs, vehicles, caves, public `goTo`, schema expansion, and Provider identity publication.

This repair does not claim R1b or M5 completion.

## Finding dispositions

### F24-1 — Graph and Path contextual integrity — confirmed / fixed

- V2 Graph evidence now binds every deterministic Build Input provenance, artifact, lock, Profile, Route, and Anchor field and rejects a V1 Graph Builder Profile.
- V2 Path evidence now proves ordered Edge adjacency and recomputes distance, XZ distance, cost, slope, step, clearance, and zero-gap metrics from canonical Graph/Path evidence.
- Path positions remain independent from Node centers; the repair does not invent that coupling.

### F24-2 — Shared Surface finite math and pair-scan complexity — confirmed / fixed

- Finite input that overflows derived geometry now fails closed under the public query error taxonomy.
- Pair preflight uses a deterministic package-private XZ broadphase and preserves ascending canonical ordinal streaming.
- Large inventories use iterative bounds accumulation; no spread-based JavaScript argument limit remains.
- Flat-to-ramp, ridge, legal 0.25m step, reversal, blocker-witness, and budget ordering regressions are covered.
- Benchmark and release-policy evidence: [Task 4 Surface Query Disposition](./2026-08-23-route-r1b-task4-surface-query-disposition.md).

### F24-3 — Connectivity reason-local evidence — confirmed / fixed

- Start/destination miss reasons bind the correct Anchor IDs and quantized positions.
- Empty Heightfield reasons bind the Build Input Terrain entity.
- Locked node, edge, search, Surface-count, triangle-pair, slope, and step limits bind their Capability Envelope values.
- Clearance width/height reasons bind the locked capsule-derived requirements.
- Collider witnesses in clearance and missing-Profile reasons must reference Build Input static Collider rows.
- Provider-observed values, candidate proofs, blocker observations, and other evidence not uniquely determined by the Build Input are deliberately not fabricated by the Traversal contract.

## Verification evidence

- `pnpm typecheck` — passed.
- `pnpm test -- --reporter=dot` — 146 files / 1,503 tests passed.
- `pnpm build` — passed; only the existing Vite large-chunk advisory remains.
- Focused V2 Traversal and Task 4 suites — passed.
- `pnpm verify:route-r1-heightfield` — passed, including deterministic repeat/concurrent/cadence evidence and no Provider identity leaks.
- `pnpm verify:canonical` — passed.
- `pnpm verify:placement-layout` — passed.
- `pnpm verify:rigged-subject` — passed.
- `pnpm verify:g-bot-subject` — passed.

The first full-suite run had one Browser navigation race in `worldkit-server.test.ts` (`Execution context was destroyed`); its focused rerun passed 12/12. A subsequent complete suite passed 1,499/1,499 before the final review corrections, and the post-correction complete suite passed 1,503/1,503.

## Independent review

Cursor fresh review `pr24-route-r1b-final-19b1d72` returned **FINAL GO** with no P0/P1. Its remaining findings were independently checked and dispositioned as follows:

| Finding | Host disposition |
| --- | --- |
| Path metric aggregation used large-array argument spreading. | Confirmed and fixed with iterative aggregation plus a 130,000-Node package-private regression. |
| Straight-path positions were independent from Node centers in code but not locked by a test. | Confirmed test gap; an offset straight-path fixture now proves the intended independence. |
| Pair budget counted before normal admission in code but had no downward-face regression. | Confirmed test gap; the budget now proves a downward candidate still counts. |
| Graph contextual mutation coverage omitted several artifact/root hashes. | Confirmed test gap; all deterministic artifact and Build Input root fields are now mutated. |
| Standalone V2 Path/Failure canonicalizers accepted a registered V1 Graph Builder identity. | Confirmed and fixed; V2 evidence now requires the V2 Registry resolver before contextual admission. |

Fresh Cursor completion review `pr24-route-r1b-final-452c2cb` inspected correction commit `452c2cb` and returned **FINAL GO** with no P0/P1. The host confirmed and closed its two remaining P2 test-proof gaps in test-only commit `2589c6d`:

- the Path-position regression now holds both endpoints fixed, moves only the middle Path point away from its Graph Node center, and requires the distinct quantized distance `8.947` instead of the Node-center distance `8.946`;
- the Graph contextual mutation now uses a second registered V2 Graph Builder Profile, independently from the existing V1 identity-rejection coverage.

The same read-only review session re-inspected `452c2cb..2589c6d` and returned **FINAL GO / No findings**. Post-follow-up focused evidence was 11/11 Route V2 contract tests plus a clean `pnpm typecheck` and `git diff --check`. Cursor did not rerun repository commands; all executable verification claims in this disposition remain host-owned.
