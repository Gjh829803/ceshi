# Route R1 Task 2 Design Review

## Review metadata

- Date: 2026-08-22
- Scope: Task 2 of `docs/superpowers/plans/2026-08-22-route-graph-traversability-r1-heightfield-implementation-plan.md`
- Review mode: design-spec review plus authority-graph audit
- Baseline: `2f1e145`
- Evidence: current traversal/runtime contracts, installed Babylon/Havok versions, and the published `recast-navigation` `0.43.1` package source
- Independent reviewer: Cursor CLI, `cursor-grok-4.6-xhigh`, read-only Ask mode

## Outcome

Task 2 is approved for implementation. The final independent review reported no P0, P1, or P2 findings. One P3 handoff ambiguity was closed before this checkpoint by requiring Task 3 to call the exact Task 2 budget guard.

## Findings and disposition

### Closed P0: incomplete Capability Envelope authority

The original plan did not require the Envelope to copy the complete V2 build policy. The revised contract now has one closed, provider-neutral Envelope containing the locked geometry/capability identities and every V2 voxel, tile, quantization, cost, and budget field. Recast accepts only that Envelope and may not reread a Subject, Lock, Profile, or Registry.

### Closed P1: duplicate Runtime identity ownership

Task 2 and Task 5 originally created different identity modules. The plan now creates only `traversal-implementation-identity.ts` in Task 2. It freezes the production Backend and Adapter manifests, exact refs and versions, canonical hash inputs, and exact Babylon/Havok dependency pins. Task 5 only consumes that value. Recast production code does not import Runtime Babylon; a dev-only cross-package test proves the exported tuple is in the compatibility allowlist. R0 placeholder hashes and the legacy Adapter Ref are explicitly rejected.

### Closed P1: IEEE-754 voxel undercount

Direct `floor(meters / cellMeters)` produced `2` for `0.3 / 0.1` and `15` for `2.4 / 0.15`. The adapter boundary now normalizes meter values to nearest integer micrometers before integer division. RED coverage must lock `0.3 / 0.1 -> 3`, `2.4 / 0.15 -> 16`, and `0.299 / 0.1 -> 2`.

### Closed P1: non-executable `maximumTiles`

`maximumTiles` is not treated as a Recast config field. The provider-neutral package owns `estimateHeightfieldTileCountV1()` and `assertTraversalGraphBuildBudgetV1()`. The guard uses the same integer-micrometer policy and must reject over-budget input with `ROUTE_GRAPH_BUDGET_EXCEEDED` before initialization or WASM allocation. Task 3 is required to call this exact guard.

### Closed P1: provider mapping and lifecycle ambiguity

The plan now pins tiled generation, all mapping and rounding formulas, remaining provider constants, one idempotent process-level initialization Promise, one package-owned asynchronous mutex, no global WASM shutdown, and reverse-order destruction of operation-owned objects on success, partial construction, and throws.

### Closed P2: missing executable lifecycle gates

Dedicated Recast config, provider lifecycle, and real-WASM provider acceptance tests are named in the file list and focused gate. The tests cover repeated initialization, concurrent calls, winding/coordinate assumptions, deterministic Envelope mapping, cleanup, and public type/JSON leak guards.

### Closed P2: incorrect injective quantization expectation

Canonical changes always change the Envelope hash, but quantization-equivalent values may map to the same voxel count. Tests now require a parameter change only when crossing a voxel boundary and require the effective eroded radius to remain at least `capsuleRadiusMeters + clearanceMarginMeters`.

### Closed P3: Task 3 could duplicate tile estimation

Task 3 now explicitly calls `assertTraversalGraphBuildBudgetV1()` and may not reproduce the tile formula.

## Implementation gate

Task 2 must proceed test-first and is incomplete until all named focused tests, `pnpm typecheck`, `pnpm verify:route-r0-contract`, dependency guards, and public Recast-leak guards pass. After implementation, a fresh self-review and Cursor Grok 4.6 Extra High code review are required; this design approval is not implementation approval.
