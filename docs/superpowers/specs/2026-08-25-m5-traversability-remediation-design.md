# M5 Route Traversability Remediation Design

**Status:** implementation authority for the reopened M5 remediation

**Baseline:** `origin/main@a8b9fd363a7116a8eb731e2c56f0f210c0ee00c8`

**Finding authority:** `docs/reviews/2026-08-24-m5-route-traversability-deep-review.md`

## 1. Goal

Close the four effective P0 and twelve confirmed P1 findings without weakening the frozen Route R0/R1/R1b or P1.5 movement contracts. Replace the unstable monolithic Vitest execution policy with a complete two-lane gate whose test census remains fail-closed as other branches add tests. The original fixed-tick step-up finding is withdrawn: Babylon and Jolt both implement validated kinematic stair reposition, so ordinary `speed × dt` is not a valid stair-step pose-delta oracle.

M5 is complete only when every Required Route is bound to the same locked capability context, produces truthful Graph/Path evidence, and is traversed by the real fixed-tick Babylon/Havok Subject Controller with canonical support and progress evidence.

## 2. Non-goals

- Do not add dynamic platforms, swimming, vehicles, NPC behavior, interiors, caves, overhangs, networking, or new movement-medium semantics.
- Do not restore Motion parameter bags, ray/AABB grounding, a second support classifier, or provider-specific fields in public Schema.
- Do not keep public compatibility aliases. The Route V2 contracts are unreleased and use a coordinated clean break.
- Do not merge the modular 3D Subject source-assets implementation into this worktree. Its later merge is an integration input, not an M5 implementation dependency.
- Do not close a finding from static review alone. Every bug requires a RED reproducer, focused GREEN, and relevant full gate.

## 3. Current integration boundary with modular Subject assets

`codex/modular-subject-source-assets@ff178a4` shares the same main merge-base and changes only:

- two modular Subject source design/plan documents;
- `scripts/lib/modular-subject-source.ts` and its test;
- root `package.json` and `pnpm-lock.yaml` for `@gltf-transform/*`.

It does not modify M5 Traversal, Recast, Runtime, Validation, Browser, Studio, or verifier owners, so it does not invalidate the current findings. Its new `scripts/lib/modular-subject-source.test.ts` will be classified by the final merged-tree test census. The only expected textual integration conflict is the root `package.json`; lockfile changes remain asset-owned because M5 gate work adds no dependency.

## 4. Frozen authority model

| State | Single owner after remediation | Consumers |
| --- | --- | --- |
| Test membership | `scripts/lib/test-gate-manifest.ts` | Vitest contract/resource configs and census test |
| Capability Envelope | the existing canonical Envelope factory, re-derived from the admitted Resolved Traversal Lock | Build Input receipt and Graph Builder admission |
| Route progress station | one Path station helper over canonical 3D arc length | Runtime runner, Tick evidence, context validator |
| Support Surface | MotionKernel retained-foot `checkSupport()` result | Route station resolution and Probe receipt validation |
| Ordinary fixed-tick movement budget | MotionKernel fixed-step input | Babylon character integration outside validated stair-step reposition |
| Stair-step landing | Babylon CharacterController up/forward/down sweeps and legal landing constraints | MotionKernel pose/support evidence and R1b fixtures |
| Surface/Collider route scope | one deterministic Build Input projection | Recast geometry and Surface inventory |
| Seam evidence | edge-local canonical portal/boundary proof | Traversal Graph edge publication |
| Required Route set | ExecutionPlan-derived canonical expected-set receipt | Report factory, validator, Browser publication, Studio admission |
| Runtime ownership | owner registration immediately after native allocation succeeds | startup/configuration failure rollback |

## 5. Gate architecture

`pnpm test` remains the only complete root Vitest wrapper. It runs:

1. `test:census`: use Vitest's public Node API to discover the root, contract, and resource-heavy config sets and compare all three with one complete explicit manifest;
2. `test:contract`: exactly the manifest rows classified `contract`, with bounded parallel workers;
3. `test:resource-heavy`: exactly the manifest rows classified `resource-heavy`, serially with one worker and file parallelism disabled.

The initial resource-heavy classification contains:

- `apps/playground/src/outdoor-scene-gameplay-loader.test.ts`;
- `packages/runtime-babylon/src/camera-preview-channel.test.ts`;
- `packages/runtime-babylon/src/capability-runtime.test.ts`;
- `packages/runtime-babylon/src/p15-conformance.test.ts`;
- `packages/runtime-babylon/src/p15-runtime-debt-repro.test.ts`;
- `packages/runtime-babylon/src/runtime.test.ts`;
- `packages/runtime-babylon/src/traversal-runtime-port.test.ts`;
- `packages/runtime-babylon/src/traversal-runtime-support-conformance.test.ts`;
- `packages/traversal-recast/src/evaluate-route.test.ts`;
- `packages/traversal-recast/src/provider-acceptance.test.ts`;
- `packages/traversal-recast/src/query-provider.test.ts`;
- `scripts/lib/route-runtime-probe.integration.test.ts`;
- `scripts/lib/route-validation-orchestrator.test.ts`;
- `scripts/lib/route-validation-runner.test.ts`;
- `scripts/lib/traversal-area-runtime-collision.integration.test.ts`;
- `scripts/lib/worldkit-server.test.ts`;
- `scripts/cli/worldkit-route-run.integration.test.ts`;

`scripts/lib/test-gate-manifest.ts` explicitly maps every root test path to `contract` or `resource-heavy`. Resource-heavy rows additionally carry one or more closed reason codes for Browser/Vite/server child processes, native Havok/Recast/WASM state, measured duration, measured memory, or measured contention. `scripts/lib/test-gate-census.ts` uses Vitest 3.2.7 `createVitest()` and `globTestSpecifications()` rather than copying Vitest's glob rules. Its canonical output is sorted repository-relative POSIX paths.

The census rejects unclassified root tests, stale or duplicate manifest rows, non-canonical/out-of-root paths, missing resource-heavy reasons, config drift, lane overlap, or a lane union different from the root universe. A new test therefore makes `test:census` RED until the gate owner classifies it; there is no default lane. `scripts/verification/verification-browser-launch.test.ts` stays in `contract` because it only reads source text. When the modular Subject asset branch is integrated, its GLB test must first produce an `UNCLASSIFIED` RED and then be explicitly added to `contract`; timing evidence, not its domain label, decides whether it moves to the resource-heavy lane.

No test timeout is increased as part of the lane change. The existing 180-second real Route case must pass in both isolated resource-lane and complete-wrapper executions.

## 6. Remediation dependency graph

Every row is an independently reviewable deliverable. The main agent owns cross-cutting contracts and integration until their interfaces are frozen.

| ID | Goal and deliverable | `depends_on` | `blocks` | Exclusive ownership | Contract and exact integration point | Required evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GATE-1 | Complete two-lane Vitest wrapper and fail-closed census | — | INT-1 | `package.json`, `vitest*.config.ts`, `scripts/lib/test-gate-*`, `scripts/testing/verify-test-gate-census.ts` | Complete explicit path→lane manifest; Vitest public discovery must equal root manifest and each lane config projection | unclassified/stale/duplicate/out-of-root/config-drift/missing-reason REDs; both lanes; twice-run wrapper; census after asset merge | main-agent-only |
| LOCK-1 | Reject any Build Input Envelope not re-derived byte-for-byte from the admitted Lock | — | GRAPH-1, INT-1 | `packages/traversal/src/build-input*`, `heightfield-source*`, orchestrator and existing Envelope/Lock tests | `RouteBuildInputReceiptV2` carries `traversalLockReceipt`; its clean-break factory accepts `{ input, traversalLockReceipt }`, re-runs the unique Envelope factory from that Lock plus the registered Graph Builder Profile, and compares canonical Envelope bytes before hashing | capsule/slope/step tamper matrix RED/GREEN; standalone receipt assert remains self-sufficient | sequential |
| PATH-1 | Establish one total Path station helper, including one-node/zero-edge paths and legal 3D self-crossing | — | PROBE-1, PROBE-2, PROBE-3 | station section of `packages/traversal/src/runtime-probe-contract*` | Canonical Path + retained sampled-foot XYZ → deterministic station, segment window, expected Surface set, total and remaining arc length | one-node, vertical segment, repeated/non-adjacent XZ and layered crossing RED/GREEN | sequential |
| PROBE-1 | Forbid long-arc Route completion at Tick 0 | PATH-1 | INT-1 | `packages/validation/src/route-runtime-probe*` arrival logic/tests | zero-tick completion only when total canonical Path arc length is within arrival tolerance | 16.795m loop RED, legal short-path GREEN, real fixture | sequential |
| PROBE-2 | Use retained-foot position and retained support as the only Route station/support authority | PATH-1 | PROBE-3, INT-1 | Runtime Probe port/runner boundary plus focused tests | MotionKernel retained foot/support sample → PATH-1 station; subject origin is not re-inferred | six-tick split RED, ledge departure/reset/rebind and R1b GREEN | sequential |
| PROBE-3 | Count and reject Tick-0 unresolved/ambiguous/wrong Surface even when later ticks exist | PATH-1, PROBE-2 | INT-1 | `packages/traversal/src/runtime-probe-contract*` | initial expected Surface from PATH-1 is always included in mismatch metrics and complete admission | forged 385-tick receipt RED/GREEN | sequential |
| MOTION-1 | Withdraw the invalid stair-step pose-delta oracle and preserve the real R1b stair gates | — | INT-1 | design/review/implementation-plan documents only | Babylon/Jolt source evidence establishes validated up/forward/down reposition; no production behavior changes | direct unpadding produces `runtime-stalled`; staged clipping produces unmatched support; existing 0.25m/0.35m/narrow/cadence fixtures remain authoritative | main-agent-only |
| LIFE-1 | Roll back native SubjectController allocation on partial construction failure | — | INT-1 | MotionKernel controller construction and `runtime.test.ts` lifecycle cases | allocate → configure/check → register; any throw disposes both Babylon collectors exactly once and rethrows primary error | created/released handle equality over three failures | sequential |
| LIFE-2 | Register Visual Capture Runtime ownership before target configuration can throw | — | INT-1 | Playground startup ordering and lifecycle tests | create → track owner → configure; failure → exactly-once dispose; never mount/render/ready | invalid entity RED and event-order GREEN | parallel-safe |
| GRAPH-1 | Give Surface and Collider inventories one deterministic Route scope | LOCK-1 | GRAPH-2, GRAPH-3, INT-1 | `packages/traversal-recast/src/heightfield-source*` | one route-scoped projection supplies both Surface and Collider inventories | remote platform pollution RED; multiple-route GREEN | sequential |
| GRAPH-2 | Fail closed on layered endpoint ambiguity before provider nearest-polygon selection | GRAPH-1 | INT-1 | endpoint admission in `evaluate-route*` and provider/query seam | canonical endpoint Surface query → zero/one/many candidate result; many publishes `start-surface-ambiguous` or `destination-surface-ambiguous` as `incomplete / complete` with at least two sorted identities; provider receives exactly one resolved Surface | reversed tile order and stacked endpoint RED/GREEN | sequential |
| GRAPH-3 | Publish only edge-local seam gap/step proof | GRAPH-1 | INT-1 | `packages/traversal-recast/src/build-graph*`, adapter identity tests | cache key includes canonical edge-local boundary/portal; gap and step sample that boundary | remote exact seam/current gap and centroid-height counterexamples | sequential |
| GRAPH-4 | Correct unavailable Surface failure status and world-space XYZ | GRAPH-1 | REPORT-1, INT-1 | `traversal-surface-query*`, `connectivity-result*`, `evaluate-route.v2*` | profile/correlation failures are `incomplete / unavailable`; internal overlap blocker retains both triangle-plane witness heights and failure Y uses the canonical first identity's actual height, then quantizes | three-reason status table RED; elevated/asymmetric overlap XYZ and reversed-input stability RED | sequential |
| REPORT-1 | Bind Report rows to the complete ExecutionPlan-derived Required Route set | LOCK-1, GRAPH-4 | REPORT-2, STUDIO-1, INT-1 | `packages/validation/src/route-evaluator*` and expected-set receipt tests | expected constraint IDs/count/hash are canonical inputs; missing/extra/duplicate rows fail closed | subset/extra/duplicate/mismatched-plan RED/GREEN | main-agent-only |
| REPORT-2 | Close V2 MIME, Browser state, and plural Surface Diagnostic contracts | REPORT-1 | STUDIO-1, INT-1 | validation publication, runtime contracts, generated/public types | kind + schemaVersion + MIME table is exact; complete Connectivity iff Path exists; ambiguous Diagnostic preserves sorted identities | MIME table, state matrix, 2/3 identity RED/GREEN | sequential |
| STUDIO-1 | Require same-world passing Route Report for import/recovery when Required Routes exist | REPORT-1, REPORT-2 | INT-1 | `apps/studio/src/server.mjs` and tests | trusted Builder/Execution evidence decides requirement; report hashes bind Authoring/IR/Plan/Lock and exact expected Route set | missing/mismatched/failed/exact report admission matrix | sequential |
| CLEAN-1 | Align slope domain, remove duplicate V2 declarations, and reopen active docs | LOCK-1, REPORT-2 | INT-1 | slope validators, duplicate declarations, active status docs | one public slope interval; no aliases/duplicate interface; docs match evidence | boundary matrix, clean-break census, docs grep | parallel-safe after contracts freeze |
| INT-1 | Integrate all tasks and close evidence | all prior rows | — | main agent; whole tree and release artifacts | one final tree, one current main, one canonical report/publication chain | focused suites; R0/R1/R1b; two test lanes; typecheck/build; Browser/Studio; real counterexamples; host full-dimension review | main-agent-only |

## 7. Sequencing and parallelism

1. Land `GATE-1` first so every later iteration uses the new policy. `pnpm test` runs census, contract, and resource-heavy as three sequential processes; it does not raise timeouts.
2. Stabilize `LOCK-1` and `PATH-1`, record the source-backed `MOTION-1` withdrawal, then handle `LIFE-1` and `LIFE-2`. Work remains in the main process unless the user explicitly requests delegation.
3. Run `PROBE-1 → PROBE-2 → PROBE-3` sequentially because all three depend on the same Path/support authority.
4. Run `GRAPH-1 → (GRAPH-2, GRAPH-3, GRAPH-4)` after the Route scope contract is stable. The three child tasks may execute in parallel only if their tests and implementation files do not overlap; `evaluate-route.ts` makes GRAPH-2 and GRAPH-4 sequential in practice.
5. Run `REPORT-1 → REPORT-2 → STUDIO-1` sequentially. These tasks change one public evidence chain and must not be split across competing dialects.
6. Run `CLEAN-1`, then main-agent `INT-1` over the integrated tree.

Delegated work, when explicitly requested, is never integration proof. The main agent reviews actual diffs, checks public naming against the AI-first schema rules, and executes every affected complete lane.

## 8. TDD and verification policy

For every finding:

1. add the smallest real-code reproducer;
2. run it and record the expected failure before production changes;
3. implement the smallest contract-preserving fix;
4. run the focused GREEN and adjacent authority suite;
5. commit the independently reviewable task;
6. invalidate and rerun downstream evidence according to the dependency graph.

Final verification on one tree includes:

- `pnpm test` through the two-lane wrapper;
- both lane commands independently;
- `pnpm typecheck` and `pnpm build`;
- `pnpm verify:route-r0-contract`;
- `pnpm verify:route-r1-heightfield`;
- `pnpm verify:route-r1b-static-platform`;
- Browser Route integration, Studio and LWDP suites;
- `pnpm verify:unreleased-clean-break`;
- the five original P0 adversarial reproducers;
- elevated/layered/remote-platform Graph reproducers;
- Report/Browser/Studio same-byte and same-hash closure;
- host full-dimension completion review with local reproduction of every new candidate.

Rendered output and manual interaction evidence remain separate from automated contract evidence. M5 cannot return to Final GO until the automated gates and the relevant real Runtime evidence are both current on the same integrated tree.

## 9. Completion criteria

- All five P0 and twelve P1 findings have committed RED/GREEN evidence and no accepted open reproducer.
- Active P2 contract inconsistencies touched by the remediation are closed; the withdrawn Medium finding stays withdrawn.
- Root Vitest census includes every current test exactly once and is rechecked after the modular Subject asset branch is integrated.
- No public alias fields, provider terminology, or second state authority is introduced.
- The final branch is rebased or merged onto the then-latest main and all required evidence is regenerated there.
- The review report records commit-level disposition and exact verification results rather than replacing historical evidence.
