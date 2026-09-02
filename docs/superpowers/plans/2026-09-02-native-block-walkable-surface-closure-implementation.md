# Native Block Walkable Surface Closure Implementation Plan

**Design:** [Native Block Walkable Surface Closure](../specs/2026-09-02-native-block-walkable-surface-closure-design.md)
**Stable task:** `NBR-65`
**Baseline:** `origin/main@c67bb5bf480d8789d9a7a757121526d010205e6d`

## Delivery graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / input -> output | Required evidence | Mode |
|---|---|---|---|---|---|---|
| NBR-65A | Freeze migration ledger and current-only grouped Collider API | BWB-2, BWB-4, BWB-6 | 65B..65F | Profile spec/types/Skill; v2 evidence + current contracts -> one API and deletion ledger | type fixtures, docs truth, exact public export census | main-agent-only |
| NBR-65B | Materialize one exact union Collider per explicit Block Group | 65A | 65C..65F | `native-babylon-block-profile` only; checked Layout + group selection -> registered proxy + frozen inventory | holes/internal faces/asymmetry/order/budget/rollback tests | sequential |
| NBR-65C | Add trusted standability and connectivity evidence | 65B | 65D..65F | Profile Host/evaluator only; checked group geometry + resolved Subject envelope + frozen Case intent -> stable report | footprint/clearance/Spawn/target/component/band tests | sequential |
| NBR-65D | Add explicit ground-boundary contribution role and SDK filter | 65B, 65C | 65E..65F | Native contribution + WorldPackage + `runtime-babylon`; checked exposed edges -> identity-bound filtered Havok boundary | installed Babylon/Havok source audit, ground/flight mask, reset/replay/isolation/cleanup | main-agent-only |
| NBR-65E | Atomically migrate active Modules, fixtures, Skills and copied Skill inputs | 65B, 65C, 65D | 65F | consumers only; old single-block selection -> grouped current contract | no legacy `blockId` dialect, self-check and package closure | sequential |
| NBR-65F | Run real Case, publish evidence, review and merge | 65E | NBR-70 | one Case root plus review/status; reference -> Package/Runtime/Capture/manual preview | focused gates, real Havok exploration, overlay, exact-SHA Mode B/runtime review | main-agent-only |

`NBR-65A -> 65B -> 65C -> 65D -> 65E -> 65F` is sequential at shared contract boundaries. Tests and documentation that consume a frozen boundary may be prepared in parallel, but no worker owns the cross-package integration or final merge.

## NBR-65A: contract and RED fixtures

1. Add type-level RED tests for required `colliderGroupId` placement and the new closed
   `colliderGeometrySource` union.
2. Prove the old direct `blockId` selection is rejected and absent from public examples, generated
   Skill copies, Corpus fixtures, and production artifacts used as current inputs.
3. Add diagnostics for duplicate/missing/empty Collider Groups, mixed selection, unsupported exposed
   edge policy, and group use across Sessions.
4. Update the Builder Skill to teach full declared playable-surface coverage, not a narrow scripted
   corridor.

Focused gate: Profile API/type/session tests and Skill source/copy tests only.

## NBR-65B: exact aggregate collision

1. Implement deterministic occupied-cell face emission and internal-face removal in a package-local
   module. Reuse Babylon geometry APIs and existing Profile lattice helpers.
2. Materialize one invisible Mesh per group and register it through the existing core registration.
3. Extend Profile inventory with `colliderGroupId`, sorted `sourceBlockIds`, `proxyKind`, geometry
   counts, and exact bounds.
4. Preserve `kind: block` singleton evidence using the same materializer path.
5. Fail before registration on count/vertex/triangle budget overflow; dispose every partial Mesh in
   reverse order on allocation, registration, or cleanup failure.

Focused gate: materializer tests, Candidate admission tests affected by geometry, Profile session tests,
and typecheck.

## NBR-65C: semantic ground checker

1. Port v2's footprint-union, clearance, adjacency, connected-component, and traversal-band algorithms
   to current Profile/Host types; do not import the old package.
2. Resolve the Subject traversal envelope from the trusted WorldRuntimeBootstrap/Registry closure.
   The Builder output must not contain policy numbers.
3. Join only explicit static-surface Collider Groups. Palette and visual group remain irrelevant.
4. Emit stable diagnostics with target, actual, limit, delta, direction, group/source IDs, and repair
   action so the existing bounded repair loop can act on failures.
5. Record the report in the existing Host evidence path and bind it to Profile/Contribution identity.

Focused gate: graph unit tests, package/check/explain identity tests, evaluator diagnostic tests, and
typecheck.

## NBR-65D: exposed-edge protection and Runtime

1. Audit the installed Babylon 9.23.0 and Havok sources for static mesh shape filtering and disposal.
2. Add one closed internal boundary role to the Native contribution and WorldPackage parser; perform a
   current-only migration of every producer/consumer.
3. Build deterministic boundary geometry from exposed support edges and coalesce only collinear,
   equal-slope contiguous segments.
4. Assign the boundary membership mask in `runtime-babylon`; the committed movement medium/motion
   kernel determines whether the Character Capsule collides with it.
5. Prove Camera and non-ground kernels do not acquire the boundary, and that reset/rebind/replay restore
   filters atomically.

Focused gate: contribution/package contract tests, actual installed-engine Havok tests, Runtime reset/
replay/isolation/throwing cleanup, Native build, and typecheck.

## NBR-65E: current-only consumer migration

1. Migrate all current Profile fixtures, BWB Corpus, representative generated Module, examples, live
   Skill, and frozen Builder Skill copy in one checkpoint.
2. Delete local helpers, old single-Block DTO fields, fallback parsers, and documentation that teaches
   corridor-only collision.
3. Keep Case-required stable Collider IDs as group selection IDs; update frozen artifacts by producing a
   new Candidate/Package/Receipt rather than rewriting published identity.
4. Add a repository census that rejects the removed selection shape in production and AI-facing input.

Focused gate: consumer tests, Skill drift/self-check, BNA clean-break gate, test census, and typecheck.

## NBR-65F: real Case and closure

1. Run `/Users/xiateng/Downloads/测试集/024_petrified_primordial_forest.png` through the formal Native
   production route on the new API.
2. Verify the full declared foreground and basin floor, not only the fixed-input centerline.
3. Verify Spawn/support, ordinary movement, steps where present, blocker walls, intentional ledges,
   ground-boundary behavior, and no seam fall-through.
4. Publish identity-bound Package, Receipt, Capture, Collider overlay, standability report, evaluation,
   and preview command. A failed final visual score may remain previewable only after Package/Runtime
   gates pass.
5. Freeze the candidate, run affected gates once, then request one exact-SHA independent Mode B plus
   runtime-deep review. Fix P0/P1 and rerun only invalidated evidence.
6. Merge the accepted checkpoint, update the live backlog, and only then resume NBR-70.

## Stopping rules

- Do not run repository-wide `pnpm test` during 65A-65E.
- Do not lower visual thresholds to hide physical coverage failure.
- Do not preserve the removed public selection dialect.
- Do not claim completion from NullEngine, structural graphs, or screenshots without real Havok evidence.
- Stop and revise the design if exact union collision requires a third Scene Source, persisted Block
  Manifest, Runtime Layout query, Mesh scan, or second support owner.
