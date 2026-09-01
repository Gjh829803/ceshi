# BWB-6 Profile Optimization Review and BNA Proposal

**Status:** Profile-side contract complete; Runtime execution deliberately deferred

**Reviewed product SHA:** `c46bd74fda652b4f05f5c8a91c422a29ffa24258`

**Comparison base:** `origin/main@a687a27b645522fd06d175f0eb754a52fbb4a373`

**Scope:** `@whitebox-world/native-babylon-block-profile` eligibility, equivalence, and deterministic
resource-driver measurement. This review does not approve or claim a Runtime optimization.

## Decision

**GO for the BWB-6 Profile-side deliverable.** The accepted tree has one new callable,
`assessBabylonNativeBlockOptimizationV1({ finalizedEpoch })`, and one current-only contract. It emits
deeply frozen Chunk residency, Thin Instance eligibility, Collider coalescing eligibility,
independent-object coverage, deterministic resource counts, equivalence booleans, and a canonical
assessment hash. There is no compatibility alias, policy override, second parser, or alternate state
owner.

The assessor is pure data analysis. It creates no Babylon Thin Instances, Physics/Havok objects,
Runtime entities, Camera/Input state, timers, ports, Browser state, or Contribution mutations.
Actual execution remains a separately approved BNA-owned task.

## Contract closure

- Collider candidate inventory now retains exact-presence `frictionRatio` and `restitutionRatio`
  already accepted and registered by the existing Profile finalization path. Absence is distinct from
  an explicit number; no Runtime default is inferred.
- The fixed XZ policy is `[4, 4]m` from `[-0.5, -0.5]m`, with half-open center ownership and stable
  signed IDs. A current full Block centered at `3.5m` can cross the center-owned boundary and is
  covered as an independent singleton.
- Thin eligibility requires exact residency, fixed shape, palette role, and semantic capture class.
  Rotation/translation stay per-block data and every Block ID remains represented.
- Collider eligibility additionally requires exact traversal binding, ratio presence/value, visual
  groups, proxy kind, face connectivity, and a completely filled rectangular microcell union.
- Forged hashes, duplicate Collider identity, broken Block joins, changed visual-group semantics, and
  malformed input fail with `WORLDKIT_NATIVE_BLOCK_OPTIMIZATION_INPUT_INVALID`.
- Baseline and proposal measurement is count-based only. It contains no wall-clock, GPU, memory-byte,
  rendered-equivalence, or Havok-equivalence claim.

## Five-family deterministic measurement

The focused contract materializes all five positive BWB-5 reconstruction families through Native
Candidate admission and the real Profile `finalize()` path, then assesses their frozen epochs.

| Case | Baseline visual draw units | Proposed visual draw units | Thin batches | Independent visuals | Residency groups | Baseline Collider proxies | Proposed Collider proxies |
|---|---:|---:|---:|---:|---:|---:|---:|
| `mountain-cliff` | 12 | 5 | 4 | 1 | 4 | 12 | 8 |
| `t-shaped-traversal` | 12 | 5 | 5 | 0 | 3 | 12 | 10 |
| `ordinary-and-blocked-steps` | 6 | 4 | 2 | 2 | 2 | 6 | 6 |
| `building-exterior` | 8 | 5 | 3 | 2 | 3 | 8 | 8 |
| `limited-interior` | 10 | 6 | 3 | 3 | 4 | 10 | 8 |
| **Total** | **48** | **25** | **17** | **8** | **16** | **48** | **40** |

The deterministic proposal reduces visual draw/geometry-buffer-set drivers from 48 to 25
(`47.9%`) and exact-box Collider proxy/triangle drivers from 48/576 to 40/480 (`16.7%`). The baseline
contains 28 `static-surface` and 20 `not-traversable` Collider bindings. Unique traversable Surface
identity prevents unsafe cross-surface coalescing; the count reduction is not evidence that Havok
objects were replaced.

## Mode B review

| Dimension | Result |
|---|---|
| D2 Functional | **GO.** Literal rectangular, L-shaped, material-split, negative-Chunk, reversed-order, forged-input, exact-coverage, deep-freeze, and five-family measurements pass. |
| D3 Architecture | **GO.** The finalized Profile epoch is the only input; the output is proposal data. Runtime, Havok, Contribution, AI Schema, Camera, Input, Browser, and production Case authority are unchanged. |
| D4 Maintainability | **GO.** One root callable, closed V1 types, canonical hashing, stable sorting, direct `lodash-es` grouping, and literal contract tests. No alias or configurable policy surface was added. |
| D5 Security | **GO.** Closed input checks reject malformed/forged epochs before publication; no filesystem, network, process, credential, timer, or untrusted code execution was added. |
| D6 Performance | **GO for measurement only.** The oracle is deterministic resource-driver counts and records exact proposal reductions. CPU/GPU/memory claims remain explicitly absent until an execution implementation exists. |

Self-review of the actual base-to-product diff found no open P0 or P1. The only final-gate defect was
the new test's missing census classification; `c46bd74f` adds the one contract-lane manifest entry.
That test-infrastructure-only follow-up did not invalidate the passing Profile suite.

## Exact-SHA verification

| Command | Result | Evidence scope |
|---|---|---|
| `corepack pnpm install --frozen-lockfile` | PASS | lockfile dependency installation |
| `corepack pnpm exec vitest run packages/native-babylon-block-profile/src` | PASS, 16 files / 120 tests | complete Profile package, including five BWB-6 tests |
| `corepack pnpm typecheck` | PASS | repository TypeScript graph affected by the new public types and manifest entry |
| `corepack pnpm test:census` | PASS, 426 total / 384 contract / 42 resource-heavy | exact test-lane classification |
| `git diff --check a687a27b645522fd06d175f0eb754a52fbb4a373...c46bd74fda652b4f05f5c8a91c422a29ffa24258` | PASS | whitespace/diff integrity |

The Profile suite ran on `7d5a35aa`; `c46bd74f` changes only the test-gate manifest. Typecheck and
census ran on the final product tree. No repository-wide test suite, Runtime/Havok test, Browser,
port, rendered capture, or manual interaction was run because BWB-6 changes no execution behavior.

## Independent review advisory disposition

The independent Cursor Cloud read-only review of PR head
`adb081f602f8989088f7678c275940b9876fe7e6` returned **GO, P0 = 0, P1 = 0**, plus two P2 and one P3.
They were batched without changing production code:

- corrected the false statement that boundary singletons were unreachable and added the current
  `3.5m` full-Block boundary fixture;
- added independent traversal-binding, visual-group, and gapped-component split fixtures;
- added the rejected-check forged-epoch fixture.

The remediation changed only this BWB-6 spec/plan/review and the focused contract test. The smallest
invalidated evidence passed: 6 focused tests, typecheck, test census, and diff-check. The earlier
complete Profile suite remains valid because no production source or existing test input changed.

## BNA-owned execution proposal

A later, separately approved BNA task may consume this assessment as a candidate plan only. Before
shipping any execution optimization it must:

1. revalidate the exact verified Package/Contribution and Profile inventory at the Runtime boundary;
2. preserve per-Block runtime entity, semantic-capture, selection/debug, reset, replace, and disposal
   behavior while implementing Thin Instances or Chunk residency;
3. preserve stable Collider/Surface/Subshape identity, support/contact behavior, friction and
   restitution, overlay mapping, and throwing cleanup while implementing any coalesced Havok shape;
4. run actual-vs-baseline rendered equivalence, frustum/Chunk boundary cases, 30/60/120 Hz-like
   cadence, dual-session isolation, reset/rebind, ledge/support, and adversarial cleanup evidence;
5. freeze the real platform/backend/resolution/warm-up/sample/statistic/noise/resource-accounting
   protocol before reporting CPU, GPU, memory, or frame-time improvements.

Until those gates pass, the BWB-6 result is an eligibility and measurement contract, not a Runtime
performance feature or production disposition.
