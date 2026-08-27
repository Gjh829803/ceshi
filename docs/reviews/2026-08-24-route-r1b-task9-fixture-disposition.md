# Route R1b Task 9 Fixture Disposition

## 1. Review metadata

- Date: 2026-08-24
- Branch: `codex/r1b-integration`
- Reviewed baseline: `c48537f08bd4c8108a642910d1d8a5e111cf25ae`
- Scope: Task 9 only, specifically `fail-wrong-collider-binding` and
  `fail-platform-edge-fall`
- Authority:
  `docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md`
  and
  `docs/superpowers/plans/2026-08-23-route-r1b-static-platform-implementation-plan.md`
- Disposition status: Task 9 implementation accepted and its focused blocking
  gates passed; Task 10 completion review remains open

This record closes Task 9 only. It does not close Task 10, R1b, or M5. The
complete clean-tree verification matrix, host review, independent review, and
public progress reconciliation remain Task 10 responsibilities.

## 2. Conclusion

The two formerly double-green fixture outcomes now use closed verifier-only
fault injections rather than increasingly artificial Authoring geometry:

1. `fail-wrong-collider-binding` uses a deterministic Graph adversarial proof
   that exercises the production tagged-polygon-to-canonical-source
   correlation path and yields `ROUTE_SURFACE_CORRELATION_MISSING`. The
   resulting canonical connectivity result is non-complete, so the normal
   Orchestrator branch does not create a Runtime Lease.
2. `fail-platform-edge-fall` keeps a complete real Recast Graph, resets the
   real Babylon/Havok Runtime onto resolved `terrain-main` support, then the
   trusted host withdraws that fixture-owned terrain PhysicsAggregate. The
   normal Probe consumes the resulting real `checkSupport()` evidence and
   yields `ROUTE_RUNTIME_SUPPORT_LOST` after the locked unsupported tolerance.

Neither mechanism belongs to Authoring JSON, Canonical Schema, Registry,
Runtime Port, CLI, Browser, Report, Snapshot, or public SDK APIs. They are
deterministic test-fixture faults owned by `scripts/`.

## 3. Baseline evidence and root cause

### 3.1 Pre-fix baseline was double-green

Direct trusted-runner diagnosis on `c48537f` observed both remaining worlds as
Graph passed and Runtime passed:

```text
fail-wrong-collider-binding:
  route-connectivity = passed
  route-runtime-conformance = passed
  diagnostics = []

fail-platform-edge-fall:
  route-connectivity = passed
  route-runtime-conformance = passed
  diagnostics = []
```

The other nine Task 9 fixtures had already been aligned during the Task 9
handoff. The completed implementation now runs all eleven fixtures through the
blocking R1b verifier; fresh gate evidence is recorded in section 6.

### 3.2 Why wrong-collider is not a stable Authoring-only geometry

Graph source tagging and correlation consume the same admitted canonical
triangle soup. For each tagged Recast polygon, Graph projection resolves the
tag to one candidate Surface and queries that Surface at the provider polygon
centroid within the locked height/XZ epsilon. Ordinary convex box, ramp, and
Heightfield geometry therefore keeps the centroid on the same source that
created the tagged polygon. Attempts to express the negative only by moving,
tilting, thinning, overlapping, or partially unbinding Authoring colliders
either remain correlated or fail earlier as ambiguity, clearance, unreachable,
or missing-profile evidence.

The stable negative is a provider/canonical projection adversary: a tagged
provider polygon spans two disconnected pieces of one canonical source, while
its centroid lies in the gap. This reaches the production
`buildTraversalGraphFromSnapshotV2()` correlation branch and must return:

```text
status = incomplete
reason = surface-correlation-missing
diagnostic = ROUTE_SURFACE_CORRELATION_MISSING
```

The proof must be constructed in a verifier-only helper. It must not weaken
`correlateTaggedTraversalSurfaceV2()`, alter `evaluateRequiredRouteV2()`, or add
a provider polygon/tag dialect to a public contract.

### 3.3 Why edge-fall is not a stable static-world geometry

The baseline edge fixture produced this relevant evidence:

```text
platform physical edge X = 12.0m
Recast Path endpoint X = 11.45m
Probe completion position X = 10.979727238938656m
destinationToleranceMetersXZ = 0.5m
maximumConsecutiveUnsupportedTicks = 6
```

Recast first erodes the walkable platform by the locked agent radius/margin.
The Probe then completes as soon as the still-supported subject is within the
0.5m destination tolerance of the snapped Recast endpoint. In the observed
run, completion happened while the subject was still about 1.02m from the
physical platform edge. Havok remained `supported` for every processed Tick.

The current Probe precedence is also intentional:

1. supported-but-wrong, unmatched, or ambiguous Surface fails as
   `ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH`;
2. raw `unsupported` increments the support-loss counter and does not count as
   Surface mismatch;
3. support loss wins after more than six consecutive unsupported Ticks;
4. deviation is evaluated next;
5. arrival is accepted only while expected support is present.

Removing `platform-deck` is therefore not the correct verifier fault: at the
step/platform seam Havok can first report `sliding` with an unmatched retained
sample, which correctly selects Surface mismatch before support loss. The
existing real-physics adversarial pattern is to withdraw `terrain-main`
immediately after a successful reset. The reset evidence proves the initial
support; subsequent fixed Ticks use the unchanged real Character Controller and
single `checkSupport()` path, now without the fixture-owned terrain body.

## 4. Implemented verifier-only integration

### 4.1 Closed fault vocabulary

`scripts/lib/route-validation-runner.ts` may accept a closed trusted-host-only
fixture option with exactly two variants:

```ts
type TrustedRouteFixtureFaultInjectionV1 =
  | Readonly<{
      kind: "inject-surface-correlation-miss";
    }>
  | Readonly<{
      kind: "withdraw-static-support-after-reset";
      supportEntityId: string;
    }>;
```

The option is exact-field validated and remains under `scripts/`. It must
never be copied into a serialized request, result, evidence file, Report,
Snapshot, Browser DTO, CLI option, or generated type.

### 4.2 Wrong-collider Graph proof

The `inject-surface-correlation-miss` helper receives the actual
`fail-wrong-collider-binding` fixture's admitted `RouteBuildInputReceiptV2`.
It creates only a private `RecastNavMeshAuditSnapshotV1` whose provider polygon
cannot correlate to that real Build Input, calls the production
`buildTraversalGraphFromSnapshotV2()`, and requires exactly
`surface-correlation-missing`. The proof does not create an independent
synthetic Build Input receipt or an auxiliary proof hash.

The trusted runner passes that private projection together with the same real
fixture Build Input to `evaluateUnavailableTraversalGraphProjectionV2()`. The
normal evaluator constructs and admits the canonical non-complete connectivity
result, and the normal Validation Report path publishes
`ROUTE_SURFACE_CORRELATION_MISSING`.

The normal Orchestrator creates a Runtime Lease only when
`routeConnectivityResult.status === "complete"`. This injected result remains
`incomplete` with `graphStatus === "unavailable"`; therefore no Runtime Lease is
created, Runtime Probe and Overlay evidence are absent, and the Runtime gate is
incomplete. The verifier does not create and immediately dispose a Runtime to
manufacture this outcome.

### 4.3 Edge-fall real Havok proof

For `withdraw-static-support-after-reset` the trusted runner:

1. creates the normal Babylon/Havok Runtime and provider-neutral Runtime Port;
2. locates exactly one fixture-owned PhysicsAggregate whose
   `metadata.worldkitEntityId` equals `terrain-main`;
3. calls the unmodified port's `resetToStartAnchor()` first;
4. requires reset evidence to be `supported`, with a `resolved` Surface whose
   `surfaceEntityId === "terrain-main"`;
5. disposes the aggregate exactly once after retaining that reset evidence;
6. forwards every fixed Tick unchanged to the real Runtime Port;
7. lets the normal Probe and Validation evaluator publish the failure.

The focused receipt regression asserts:

- first post-reset Tick is raw `unsupported`;
- failure occurs on the seventh consecutive unsupported Tick because the
  locked maximum is six and the comparison is strictly greater-than;
- `unexpectedSupportLossCount === 1`;
- `wrongSupportSurfaceCount === 0`;
- failure kind is `runtime-support-lost` and the Report diagnostic is
  `ROUTE_RUNTIME_SUPPORT_LOST`.

Provider access to the aggregate is acceptable only inside this verifier seam.
The aggregate, Babylon/Havok handle, provider name, and fault option must not be
serialized.

### 4.4 Fixture selection authority

`scripts/verification/verify-route-r1b-static-platform.ts` derives injections from the
closed fixture ID rather than let an arbitrary fixture caller choose them:

```text
fail-wrong-collider-binding -> inject-surface-correlation-miss
fail-platform-edge-fall     -> withdraw terrain-main after reset
all other fixtures          -> no injection
```

`runFixture()` accepts only ordinary trusted options such as render
cadence and merges the verifier-owned fault afterward. A caller must not be able
to override the fixture mapping. The existing oracle remains unchanged.

## 5. Focused regression disposition

The Task 9 focused suite now proves:

- the adversarial Graph projection reaches the real
  `surface-correlation-missing` branch;
- its canonical injected Result is bound to the actual Build Input;
- wrong-collider publishes Graph failed + Runtime incomplete and creates zero
  Runtime Leases;
- wrong-collider emits no Runtime Probe or Route Overlay evidence;
- edge-fall resets on resolved `terrain-main` support before disposal;
- support is withdrawn exactly once;
- edge-fall Graph passes and Runtime fails with exactly
  `ROUTE_RUNTIME_SUPPORT_LOST`;
- the Probe fails on the seventh consecutive unsupported Tick and records
  `maximumConsecutiveUnexpectedUnsupportedTicks === 7`,
  `unexpectedSupportLossCount === 1`, and
  `wrongSupportSurfaceCount === 0`;
- unknown fields, unknown fault kinds, an empty entity ID, zero matches, or
  multiple aggregate matches fail as infrastructure errors;
- the fixture option and all Provider identities remain absent from every
  Report/evidence/Browser/CLI/public-contract scan.

## 6. Fresh Task 9 verification evidence

The following gates were rerun against the integrated Task 9 worktree on
2026-08-24:

| Gate | Fresh result |
| --- | --- |
| Task 9 focused Vitest matrix | passed: 43 files, 525 tests |
| `pnpm verify:route-r0-contract` | passed |
| `pnpm verify:route-r1-heightfield` | passed |
| `pnpm verify:route-r1b-static-platform` | passed |
| `pnpm typecheck` | passed |
| `git diff --check` | passed |

The R1 success Report remained deterministic across repeat, concurrent, and
30/60/120-like cadence runs with hash
`sha256:87b2c4c6c7d64384075d52c65b5a6bdc8ca63e92c84647cd2cedbc5f72da4b91`.

Task 10 then remains responsible for the clean-tree full matrix, host review,
independent review, documentation reconciliation, and final R1b/M5 handoff.
This disposition does not claim that `pnpm test`, `pnpm build`, or any Task 10
review step has run.

## 7. Disposition ledger

| ID | Decision | Status |
| --- | --- | --- |
| T9-F1 | Stop searching for a pure Authoring geometry that emits correlation-missing; use a production Graph projection adversarial proof. | Implemented and gated |
| T9-F2 | Keep wrong-collider non-complete so Orchestrator never creates a Runtime Lease. | Implemented and gated |
| T9-F3 | Stop searching for a static edge geometry that defeats Recast erosion plus arrival tolerance; withdraw fixture-owned `terrain-main` after reset. | Implemented and gated |
| T9-F4 | Preserve the existing oracle, Probe precedence, evaluator semantics, physics ownership, and public protocols. | Implemented and gated |
| T9-F5 | Keep Task 10, R1b completion, and M5 completion open until all required gates and reviews finish. | Open |
