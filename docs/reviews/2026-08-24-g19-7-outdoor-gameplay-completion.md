# G19-7 Outdoor Gameplay Completion Record

## Status

- Disposition: **Complete on integration branch**.
- Code completion commit: `da90f16`.
- Verification branch: `codex/g19-7-integration`.
- Scope: Outdoor/catalog Gameplay route, page lifecycle, artifact-only lifecycle, six-scene browser evidence.
- Excluded: G19-8 full-repository completion review and unreleased protocol clean break.

## Delivered authority split

- Catalog Gameplay compiles each registered Outdoor scene through Authoring V4, Normalized IR V4,
  ExecutionPlan V5, RuntimeWorldConfiguration and RuntimeHost/Babylon.
- `window.__WORLDKIT__` is the only Gameplay Browser authority and publishes Browser V5/Snapshot V4.
- The Three/Rapier `SdkWorldAdapter` is a rendering-only artifact implementation. Artifact routes do not
  create RuntimeHost, publish `__WORLDKIT__`, fixed-step simulation, Gameplay control, Snapshot or reset APIs.
- Unknown scene IDs fail closed before constructing either Runtime or artifact renderer.
- Page ownership uses exact-once lifecycle helpers and `pagehide`; BFCache page hides do not dispose live state.

## Confirmed fixes

- Production-scale explicit Heightfields no longer use spread arguments in Authoring layout copying or
  Compiler terrain copying. The regression covers 400x400 and 513x513 sample grids.
- Authoring V3/V4 schema ceilings now admit up to 1,048,576 samples while G19-8 prepares the V4-only
  clean break.
- Catalog identity is passed explicitly as `sceneCatalogId`; it is not inferred from a scene definition ID.
- Browser verification passes the fixed-input tick count into the browser closure and gives large scenes a
  realistic readiness budget.

## Verification evidence

- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- G19-7 and adjacent clean-break focused matrix: 10 files / 92 tests passed.
- `pnpm verify:outdoor-gameplay`: passed.
  - Gameplay Catalog routes: 6/6.
  - Artifact-only routes: 6/6.
  - Unknown route fail-closed: passed.
- `git diff --check`: passed.

The real browser gate verifies Browser V5/Snapshot V4 readiness, fixed input, deterministic reset, possession,
unchanged uncontrolled Subjects, read-only Route query behavior, artifact API isolation and screenshots.

## Remaining boundary

G19-7 completion does not close G19-8. The current V4/V5 product surface still reuses an internal
Authoring V3 / ExecutionPlan V4 implementation chain. Because the project is unreleased, G19-8 must execute
the clean break defined in
`docs/superpowers/specs/2026-08-24-unreleased-compatibility-clean-break-design.md`, then run the complete
repository gate matrix and completion review.

Large Heightfield catalog import currently takes materially longer than small scenes. It is accepted as a
measured optimization item because the browser gate passes without alternate semantics; it must not be
addressed by restoring a legacy loader or lowering validation correctness.
