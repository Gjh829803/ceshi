# Validation Capture/Integrity V1 change review

## 1. Review metadata

- Review mode: **B — branch diff**. Required dimensions are D2, D3, D4, D5, and D6; D1 was also checked because this slice changes a public validation capability boundary.
- Review object: `origin/main@36e304316b4154bf879cd6545ab2ea282930c6be...codex/validation-capture-integrity-v1@59936a8087a5ba277599838d22b8bf085f02a2de`.
- Implementation plan: `docs/superpowers/plans/2026-08-21-validation-capture-integrity-v1.md`.
- Governing specification: `docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md`, Capture/Integrity V1 only.
- Installed engine versions recorded from `pnpm-lock.yaml`: `@babylonjs/core@9.21.2` and `@babylonjs/havok@1.3.14`. This diff does not change or make a new assertion about Babylon or Havok behavior.
- Runtime checklist applicability: the CLI/resource-lifetime portions of `runtime-deep-review-checklist.md` were applied. Physics, input, movement, animation, camera, render scheduling, and Babylon runtime authority are unchanged.
- Independent adversarial review disposition: all reported branch findings were reproduced against the current tree and fixed before this report; the final reviewer verdict was ready to merge with no remaining issue.

### Verification evidence

| Evidence layer | Command or inspection | Result |
|---|---|---|
| automated-contract | `pnpm typecheck` | exit 0 |
| automated-contract | `pnpm test` | exit 0; 73 files, 661 tests |
| automated-contract | `pnpm test:scenes` | exit 0; 2 files, 26 tests |
| automated-contract | `pnpm build` | exit 0 |
| automated-contract | `pnpm verify:canonical` | exit 0 |
| automated-contract | `pnpm verify:placement-layout` | exit 0 |
| rendered-visual | `pnpm verify:rigged-subject` | exit 0; verifier-generated browser screenshots and pose-difference evidence passed |
| rendered-visual | `pnpm verify:g-bot-subject` | exit 0; verifier-generated browser screenshots and action evidence passed |
| rendered-visual | `pnpm verify:control-capture` | exit 0; two Browser-produced five-pass Capture Bundles passed |
| automated-contract | `pnpm verify:validation-capture` | exit 0; valid, missing-pass, invalid-depth, mixed-take, and damaged-hash cases reached their expected outcomes |
| static-read | `git diff --check` | exit 0 |
| manual-interaction | not run | not required for an engine-neutral contract and filesystem validation slice; no control-feel claim is made |

Known non-blocking warnings were unchanged: Rapier's deprecated initialization-parameter warning, Babylon NullEngine skeleton uniform-vector warning, and Vite's large-chunk warning. None is introduced or suppressed by this diff.

## 2. Old conclusion revalidation

No dated review under `docs/reviews/` previously covered this new package or CLI. The branch's independent adversarial review raised the following issues; each was revalidated on the current tree rather than copied as an inherited conclusion:

| Prior conclusion | Current-tree disposition and evidence |
|---|---|
| A Required Metric could use `not-applicable` to bypass a Blocking Gate | **Confirmed, fixed.** Required `not-applicable` now derives `incomplete`, every Blocking Gate must be exactly `passed`, and the built-in V1 Profile rejects applicability claims because it defines no applicability condition (`24:82:packages/validation/src/policy.ts`, `1038:1110:packages/validation/src/validate.ts`). |
| Validation could report evidence while the Bundle changed during evaluation | **Confirmed, fixed.** The adapter collects the complete directory evidence before and after evaluation and aborts on directory-hash or byte-count drift (`123:160:scripts/lib/control-capture-validation.ts`, `406:419:scripts/lib/control-capture-validation.ts`). |
| Output containment could be bypassed through symlinked or not-yet-created parents | **Confirmed, fixed.** The CLI resolves the nearest existing ancestor before directory creation, then checks the created real path again (`126:180:scripts/lib/validation-cli.ts`, `205:261:scripts/lib/validation-cli.ts`). Tests cover direct, symlinked, and nested-missing output paths without mutating the Bundle (`144:201:scripts/lib/validation-cli.test.ts`). |
| Reports allowed ambiguous Diagnostic ownership or evidence-free evaluated results | **Confirmed, fixed.** Evaluated Metrics require Evidence, failed/not-evaluated Metrics require Diagnostics, and every Diagnostic has exactly one declared Gate/Metric owner (`704:853:packages/validation/src/validate.ts`). |
| The public required flag did not follow boolean naming rules | **Confirmed, fixed.** The only public field is `isRequired`; the built-in Profile and policy consume that exact term (`13:21:packages/validation/src/policy.ts`, `5:65:packages/validation/src/profile.ts`). |
| Report expectations could drift from the resolved Profile | **Confirmed, fixed.** V1 binds the exact Profile Ref/version/hash, materializes all declared Gates/Required Metrics, and verifies evaluator plus expected parameters (`1021:1110:packages/validation/src/validate.ts`). |
| Conformance did not prove that the emitted file could round-trip through the strict contract and canonical hash | **Confirmed, fixed.** The conformance runner executes the CLI, parses the emitted report, validates it, recomputes its hash, and covers five outcome fixtures (`45:90:scripts/verification/verify-validation-capture.ts`, `103:180:scripts/verification/verify-validation-capture.ts`). |

The runtime findings closed by the 2026-08-20 reviews remain outside this diff. No ground-support, movement-medium, camera, or render-frame code was changed, so those fixes were not reimplemented.

## 3. Findings

No open P0, P1, or P2 finding remains in the reviewed base-to-head diff.

The following are explicit deferred capabilities, not defects in this bounded V1 contract:

- Validation subjects other than `control-capture-bundle`.
- Placement, Physics, Route, Composition, Replay, and Performance Gate integration.
- Validation Profile composition, `verify compare`, Browser/CI Evidence publication, Replay/Resume, and video-model adapters.
- Production Profile/default switching and migration of the legacy Bundle `validation-report.json` placeholder.

These remain open in `docs/18-refactor-progress-and-backlog.md`; README and architecture documents describe Capture/Integrity as a narrow delivered slice rather than the complete production-validation system.

## 4. Dimension coverage

| Dimension | Status | Evidence and conclusion |
|---|---|---|
| D1 Positioning and requirement boundary | checked (additional) | The new package consumes a Control Capture Bundle and emits an engine-neutral report. It does not expose Babylon/Havok handles or claim support for terrain, interiors, vehicles, NPC behavior, caves, overhangs, or networking. Deferred subjects and gates are explicit. |
| D2 Schema and AI friendliness | checked | Public contracts use closed discriminators, `schemaVersion`, `version`/`resolvedVersion`, `...Ref`, `...ById`, `sizeBytes`, stable IDs, and `isRequired`. Unknown fields and Profile/Report drift fail with structured codes and paths (`300:422:packages/validation/src/validate.ts`, `898:1019:packages/validation/src/validate.ts`). No provider terminology crosses the public contract. |
| D3 Promise versus implementation | checked | README, overview, architecture, backlog, spec, and plan all call this Capture/Integrity V1 and keep broader Gate subjects open. The concrete entry points are `packages/validation`, `worldkit verify capture`, `worldkit verify explain`, and `pnpm verify:validation-capture`; all were exercised above. The overall progress remains conservatively reported as approximately 62%. |
| D4 Single authoritative state | checked | The built-in Profile owns Gate/Metric requirements; pure policy owns derived Gate/Report status; the existing Bundle validator remains authoritative for manifest/pass/hash/ownership semantics. One shared byte-evidence collector is reused by Bundle production/validation and the new adapter (`276:304:scripts/lib/control-capture-bundle.ts`, `123:160:scripts/lib/control-capture-validation.ts`). No second physics, medium, facing, camera, action, or time authority was added. |
| D5 Engineering quality and maintainability | checked | `@whitebox-world/validation` declares its direct dependencies. Generic collection/object operations use named `lodash-es` imports; comparisons use strict equality and nil checks use `isNil`. Canonical JSON, stable sorting, deterministic diagnostic IDs, pre/post byte evidence, and no-replace hard-link publication protect determinism and ownership (`327:345:scripts/lib/control-capture-validation.ts`, `182:203:scripts/lib/validation-cli.ts`). Adversarial tests cover malformed contracts, missing evidence, Profile drift, concurrent publication, symlink containment, evaluator failure, and mutated Bundles. |
| D6 Gates and evidence separation | checked | Blocking failure has priority over incomplete and cannot be offset by advisory results (`48:82:packages/validation/src/policy.ts`). Evidence levels and all command exit codes are recorded above. Browser-generated screenshots prove only existing rendering/capture paths; no manual-control or full-production-validation claim is inferred from them. |

## Review conclusion

The Capture/Integrity V1 slice is internally coherent, AI-facing names follow the repository conventions, the immutable Bundle remains outside report ownership, and Blocking Gate semantics cannot be hidden by advisory or inapplicable results. With the recorded verification matrix passing, this reviewed diff is ready for fast-forward integration into `main`.
