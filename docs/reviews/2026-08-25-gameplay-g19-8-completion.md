# G19-8 Completion Review Record

## Status

- Date: 2026-08-25.
- Branch: `codex/g19-7-integration`.
- Observation point: committed candidate `99fb822`.
- Disposition: **Final GO — G19-8 and the G19 program are complete**.
- Scope: unreleased-protocol clean break, zero-consumer census, full G19 verification and host completion
  review.
- Authority: `docs/superpowers/specs/2026-08-24-unreleased-compatibility-clean-break-design.md` plus the
  full-dimension and Runtime deep-review checklists.

G19-7 is complete through code commit `da90f16` and completion record `1594823`. Candidate `99fb822`
completes UCCB-50, UCCB-60, UCCB-65 and UCCB-70, passes the complete integrated matrix below and has been
semantically reviewed by the host. The evidence remains separated into automated contract evidence and
real Browser/Havok capture evidence; no unsupported broad manual-interaction claim is made.

## Clean-break policy

This repository has not shipped a public SDK release and has no approved production WorldPackage or replay
consumer that requires development-history compatibility. Consequently:

1. Every superseded top-level Authoring, IR, Plan, Runtime Snapshot, Registry, CLI or Browser path that can
   be removed in this slice must be removed together with its export, parser, fixture, fallback and test-only
   consumer.
2. No alias, converter, fallback read, dual write or dual publication is retained merely to preserve local
   development history.
3. A version suffix does not by itself indicate compatibility debt. Current versioned nested components
   remain when they are the only authoritative contract; this includes the current Gameplay V1
   components, current Traversal V2 structures and Browser Protocol V5.
4. If final integration proves that a superseded path cannot be deleted safely in this slice, it must be
   entered in the deferred-removal ledger with its exact consumer, blocker, owner, removal gate and deadline.
   An unowned or open-ended deferral fails G19-8.

## Committed implementation evidence

| Work unit | Status at observation point | Committed evidence | Remaining work |
| --- | --- | --- | --- |
| UCCB-00 | Complete | `da90f16`, `1594823` freeze the passing G19-7 Outdoor/catalog input | None |
| UCCB-10 | Complete | `1b8c311`, `cfa16b7`, `b19e56a` make Authoring/IR V4 self-contained and migrate the current authoring consumers | Recheck in final census |
| UCCB-20 | Complete | `3fb2397`, `23f5985`, `fbe7ff4` compile IR V4 directly to Plan V5, remove the old compiler entry and refresh the current locked hash | Compiler/full-suite rerun |
| UCCB-30 | Complete | `a44d160`, `2d312b1` make Plan V5 self-contained and remove the superseded Plan V4 public contract | Runtime/WorldPackage rerun |
| UCCB-40 | Complete | `9ae108a`, `592fbeb`, `1e58c0b` require a locked Subject capability assembly through Registry, Compiler and RuntimeHost tests | Runtime and asset gates |
| UCCB-50 | Complete | `f453810` and `da2fe27` make Babylon Runtime current-only, explicitly unbound/possessed and camera-publication safe | None |
| UCCB-60 | Complete | `f453810`, `cf94b90`, `3fea29b`, `0d9a2bd` remove superseded Runtime/Authoring consumers and refresh current fixtures | None |
| UCCB-65 | Complete | `0ad72e8`, `3e671a2`, `99fb822` close the classified census, generated artifacts and future cleanup ledger | None; HNC-F1 is a new pre-Alpha audit, not retained compatibility |
| UCCB-70 | Complete | Candidate `99fb822` passed the integrated matrix and host semantic review | Integrated with current `main@134592e` by the final G19 merge commit |

## Focused evidence already observed

The following evidence was produced during individual work-unit implementation. It justifies proceeding to
integration, but it must not be copied into the final disposition as a substitute for a fresh integrated run:

- G19-7: `verify:outdoor-gameplay` passed 6/6 Gameplay routes, 6/6 artifact-only routes and the
  unknown-scene fail-closed case; its focused matrix passed 92 tests.
- UCCB-10 authoring-loader/current-consumer slice: 47 focused tests passed.
- UCCB-20 direct Compiler slice: 72 focused Compiler tests passed before the later capability-assembly
  golden was refreshed by `fbe7ff4`.
- UCCB-40 capability-assembly slice: 22 focused files / 227 tests passed.
- Playground V5-only adapter slice: 34 focused tests passed.
- Placement verifier migrated to Authoring/IR V4 and passed once during implementation.
- The clean-break verifier's own focused suite passed 4/4 cases before the remaining deletion work.

## Required final verification

All commands below passed on the tracked tree of committed candidate `99fb822`:

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
pnpm verify:outdoor-gameplay
pnpm verify:unreleased-clean-break
```

Observed results:

- `pnpm test`: 178/178 files and 2,172/2,172 tests passed; Vitest uses the official `threads` pool with two
  workers because Vitest 3.2.7's fork RPC timed out after long Browser/Havok files despite passing assertions.
  No unhandled-error suppression is enabled.
- `pnpm verify:unreleased-clean-break`: 632 files scanned, 0 forbidden matches and 489 retained
  current-authority matches.
- Canonical, Placement, Rigged Subject and G Bot gates passed with real Browser screenshots, independent
  Subject state, wall collision, jump/action pose and deterministic reset evidence.
- Control Capture and Validation Capture passed, including invalid/mixed/damaged negative cases.
- Route R0, R1 Heightfield and R1b Static Platform passed. R1/R1b include real Babylon/Havok execution,
  support-loss and mismatch failures, provider-neutral evidence and identical 30/60/120-like outcomes.
- Outdoor Gameplay passed all 6/6 Gameplay Browser gates, all 6/6 artifact-only gates and unknown-scene
  fail-closed behavior.
- `pnpm build` passed. The existing Vite large-chunk warning, Babylon bone-uniform warnings and deprecated
  Rapier initialization warning are non-blocking existing warnings and were not converted into compatibility
  behavior.

Runtime completion also requires the applicable adversarial evidence from
`docs/reviews/runtime-deep-review-checklist.md`: 30/60/120 Hz-like render timing, multi-instance isolation,
unsupported spawn and ledge departure, held-versus-pressed input, reset/rebind, partial construction,
throwing cleanup and provider-resource disposal. Automated contract evidence, real Browser/Havok evidence
and manual interaction evidence must be reported separately.

## Deferred-removal ledger

No compatibility deferral is approved at this observation point.

This ledger is the mandatory HNC-50 output of UCCB-65. A current authoritative contract with a version
suffix belongs in the classified census, not in this deferral table. Only a proven superseded path with a
real current production blocker may be deferred.

If a real blocker appears during final integration, add exactly one row per superseded path. Every column is
mandatory; `unknown`, `later`, `compatibility` or a release without an exact removal gate is not acceptable.

| Superseded path | Exact current consumer | Blocker | Owner | Removal gate | Deadline |
| --- | --- | --- | --- | --- | --- |
| _None currently approved_ | — | — | — | — | — |

## Post-G19 structural cleanup commitment

The compatibility deferral ledger remains empty: G19-8 does not retain a superseded alias or converter.
The current Scene DSL center-height to Canonical support-origin conversion has instead been renamed to
`SCENE_HUMANOID_SPAWN_CENTER_OFFSET_METERS` and registered as `SCENE-ORIGIN-1` in the historical naming
cleanup plan. It is a current semantic bridge, not a legacy input compatibility path. `HNC-F1` must remove it
before the first SDK Alpha release after the Scene origin/collider-derived placement contract is frozen and
all scene, Outdoor Gameplay and Plan gates pass without the fixed 0.9m conversion.

## Final host disposition

**Final GO.** The host reviewed the integrated diff against `main`, confirmed one owner for possession,
fixed-step time, support, facing and camera state, and found no open confirmed P0/P1 or applicable P2 issue.
The compatibility deferral ledger is empty, the current-only census is zero, and all required automated and
real Browser/Havok gates passed. G19-8 and the overall G19 program are complete. The final merge preserves
the newer Canonical Camera package-boundary documentation from `main@134592e` and records remote delivery.
