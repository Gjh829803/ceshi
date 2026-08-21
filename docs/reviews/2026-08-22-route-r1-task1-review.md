# Route R1 Task 1 change review

## Review metadata

- Mode: B change review, D2-D6, plus the applicable Runtime deep-review ownership and resource-lock items because the built-in primitive Subject's Runtime resource ownership changed. Timing, reset/rebind, cleanup, and input-transition checklist rows are unchanged by this slice and are not claimed as newly exercised.
- Object: the uncommitted Task 1 implementation on `codex/m5-route-r1-heightfield`.
- Baseline: `f1f6381222e9e7b16d5e5ac78f23ca0e34454914`.
- Authority: `AGENTS.md`, `docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md`, and Task 1 of `docs/superpowers/plans/2026-08-22-route-graph-traversability-r1-heightfield-implementation-plan.md`.
- Installed engine evidence: Babylon.js `9.21.2`. `PhysicsAggregate` derives a `CYLINDER` from mesh bounds and the installed Havok adapter calls `HP_Shape_CreateCylinder`; this matches the canonical cone-to-cylinder Collider projection.
- Evidence levels: static-read, automated-contract, rendered-visual, and browser Runtime verification. Manual control-feel inspection was not part of this slice.

## Authority map

| State | Authority after this slice | Consumers in this slice |
| --- | --- | --- |
| Connectivity intent | Authoring V4 `connected-by-route` | Normalized IR V4 and Execution Plan V5 |
| Heightfield Traversal Surface identity | Compiler-derived V5 traversal row | Future Graph Builder |
| Static Collider identity and geometry | `ExecutionPlanV5.staticColliders` | Future Graph Builder and Task 5 Runtime migration |
| Subject traversal resources and limits | one `ResolvedTraversalLockV1` receipt | Future Graph Builder, Runtime probe, and Validation |
| Ground support | unchanged Havok `checkSupport()` path | current Babylon Runtime |

No second ground-support, movement-medium, facing, camera, action, or fixed-time owner was introduced.

## Prior finding disposition

Five Cursor Grok 4.6 Extra High passes reviewed the same working-tree checkpoint.

| Finding | Disposition on current tree |
| --- | --- |
| Lock could combine Profile Hashes with unrelated compiled Collider/Physics values | Confirmed, reproduced by failing tests, then fixed. Plan, normalized Definition, normalized Collider Profile, and Resource Lock identities now fail closed on one-sided mismatch. Registry Subject Definition resource bytes and normalized Definition bytes intentionally have distinct hashes; the compiler validates the canonical Resource Lock hash chain and separately validates Plan-to-normalized-Definition identity instead of comparing unlike hashes. |
| Incomplete `capabilityAssembly` leaked a native `TypeError` | Confirmed, reproduced, then fixed with the closed `TRAVERSAL_LOCK_COMPILE_FAILED` diagnostic. |
| Heightfield logical Subshape ID must be `primary` | Withdrawn. The frozen `primary` compatibility rule applies to the R1 single-Primitive static-object projection; Heightfield is a separate surface kind. |
| V5 plan-hash test did not isolate traversal-only content | Confirmed and fixed. The test changes only `constraintId` and locks `executionPlanHash === sha256CanonicalJson(ExecutionPlanV5)`. |
| Primitive Subject test allowed Collider Derivation Profile leakage | Confirmed test gap and fixed with a negative exact-Ref assertion. |
| Subject Definition Resource Lock hash could be changed without invalidating the traversal-lock compilation | Confirmed by the final documentation audit, reproduced by a failing test, then fixed by validating the canonical Resource Lock hash against both Normalized IR and Execution Plan before issuing a receipt. |
| Task 1 claimed future Graph/Runtime receipt consumers were already proven | Confirmed documentation overstatement. Task 1 now freezes the unique construction seam; consumer wiring remains explicitly assigned to Tasks 3-9. |
| V4 hash evidence did not directly prove the complete normalized bytes and connectivity-only changes | Confirmed test gap and fixed with an exact canonical-hash assertion plus a connectivity-only mutation regression. |
| Resource Lock regression title implied the Registry resource hash should equal the normalized Definition hash | Confirmed documentation/test naming issue. The test now names the actual break: a changed Lock row without a matching collection hash. The two byte domains are frozen explicitly in the implementation plan. |
| Plan-to-normalized-Definition hash mismatch lacked an adversarial regression | Confirmed coverage gap. The compiler already failed closed; a two-sided tamper regression now protects both Plan and normalized-Definition mutations. |

The final Cursor follow-up reported no remaining P0, P1, or P2 finding in Task 1.

## Findings

No open P0-P2 findings.

The build retains the repository's existing advisory warning for chunks larger than 500 kB. This Task does not expand the bundle-size warning and does not treat it as traversal capability evidence.

## Verification evidence

All commands ran from the isolated worktree and exited `0`:

| Command | Result |
| --- | --- |
| `pnpm verify:route-r0-contract` | Eight frozen R0 checks passed; R0 bytes remained stable. |
| `pnpm typecheck` | Passed. |
| `pnpm test -- --reporter=dot` | 98 files, 869 tests passed. |
| `pnpm build` | Passed; existing large-chunk advisory only. |
| `pnpm verify:canonical` | Passed with Browser + Babylon/Havok evidence. |
| `pnpm verify:placement-layout` | Passed with 19 constraints and 8,194 search nodes. |
| `pnpm verify:rigged-subject` | Passed, including pose, isolation, collision, and asset-tamper gates. |
| `pnpm verify:g-bot-subject` | Passed, including four actions, pose separation, isolation, and wall collision. |

Protocol and default-Subject behavior changes refreshed the package-subject and placement example artifacts. Rigged/G Bot image bytes changed only through environment rasterization while their protocol hashes and Runtime states remained identical, so those image-only changes were not retained.

## Dimension coverage

| Dimension | Status |
| --- | --- |
| D1 | Not required for Mode B; current outdoor Heightfield boundary remains unchanged. |
| D2 | Checked: canonical role-qualified IDs, `kind` discriminators, units, Ref/Hash ownership, no Recast/provider vocabulary in public Plan data. |
| D3 | Checked: V5 surfaces and static colliders are explicitly Task 1 outputs, not claimed as Runtime capability before Tasks 3-9. |
| D4 | Checked: one lock compiler, one Collider authority, and no new support or movement-medium inference. |
| D5 | Checked: direct dependencies, deterministic sorting/hashing, closed errors, strict equality/null discipline, adversarial tests. |
| D6 | Checked: contract, full-suite, build, browser Runtime, rendered artifacts, and known-warning classification are recorded separately. |

## Completion decision

Task 1 is complete. R1 and M5 remain open: no Graph build, Path query, Runtime route probe, dual blocking gate, or R1b static-platform capability is claimed by this checkpoint.
