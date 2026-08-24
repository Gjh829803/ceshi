# G19-8 Completion Review Record

## Status

- Date: 2026-08-25.
- Branch: `codex/g19-7-integration`.
- Observation point: committed `HEAD@2d312b1`; Babylon Runtime V5-only work remained uncommitted and in
  progress when this record was established.
- Disposition: **In progress — not a completion claim**.
- Scope: unreleased-protocol clean break, zero-consumer census, full G19 verification and host completion
  review.
- Authority: `docs/superpowers/specs/2026-08-24-unreleased-compatibility-clean-break-design.md` plus the
  full-dimension and Runtime deep-review checklists.

G19-7 is complete through code commit `da90f16` and completion record `1594823`. G19-8 remains open until
UCCB-50, UCCB-60 and UCCB-70 are complete, every required gate below is rerun on the integrated candidate,
and the host dispositions the final diff. A worker report, focused test pass or clean `typecheck` alone is
not sufficient completion evidence.

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
| UCCB-50 | In progress | `c0c05ad` makes the Playground adapter V5-only; `3e4fda0` moves app consumers to the Babylon provider projection | Finish Babylon Runtime V5-only construction, remove V3 snapshot/direct-bind/legacy-profile paths, run Runtime deep review |
| UCCB-60 | In progress | `c32ecb5`, `2d312b1`, `b148472` remove old Authoring V3/Plan V4 contracts and migrate part of the verifier surface | Delete all remaining superseded exports, fixtures, branches and test consumers after UCCB-50 |
| UCCB-65 | In progress | `docs/superpowers/plans/2026-08-25-historical-naming-and-compatibility-path-cleanup-plan.md` defines the blocking naming/compatibility census | Classify retained versioned names, remove hidden compatibility behavior, regenerate superseded artifacts and close or register every deferral |
| UCCB-70 | In progress | This review record and the machine clean-break verifier provide the disposition surface | Zero census, full gates, final host review and Git integration evidence |

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

All commands below are **pending as one fresh integrated matrix** unless a later section records their exact
candidate commit, exit status and artifacts:

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

**Not yet performed.** Before changing this status, the host must:

1. inspect the final branch diff against `main`, not only the worker commits;
2. confirm the clean-break census is zero or every remaining item is present in the ledger above;
3. review Runtime state ownership, fixed-step time, possession, camera, support and resource cleanup against
   both authoritative checklists;
4. disposition every confirmed P0/P1 and applicable P2 finding;
5. run the complete verification matrix on the exact candidate commit; and
6. record branch push and authorized main integration evidence.

Until those steps are recorded, G19-8 and the overall G19 program remain **in progress**.
