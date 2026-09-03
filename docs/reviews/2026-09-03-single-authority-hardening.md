# Single-authority hardening review

## Scope and design authorities

This review covers the change based on
`7d5fcbdfd925d1c69802071f9f22dc1de9e20199`. The implementation is evaluated
against the repository's unreleased clean-break rule, the frozen 3C
CharacterMovement ownership boundary, P22 relationship-state ownership, the
runtime deep-review checklist, and ADR-0007's Babylon Native isolation boundary.

## Authority decisions

- RuntimeHost exposes one fixed-input entry: `prepareFixedInputTick`. The
  returned transaction owns projected World/View state plus commit and abort;
  there is no mutating compatibility path.
- Camera-relative planar-vector Subjects are admitted only to
  `CharacterMovementRuntimeV1`, independent of static or rigged presentation.
  Specialized throttle/steer and flight algorithms remain explicitly disjoint
  and reject planar admission.
- Authored Spawn placement is not treated as support truth. After all colliders
  and Subjects activate, each CharacterMovement Body performs exactly one
  `checkSupport()` query before the first publishable Snapshot; unsupported
  starts publish `air`, and a query failure rolls back construction without
  exposing a Runtime.
- Canonical Gameplay World State publishes only the V2 Locomotion envelope.
  Provider projections distinguish `character-movement` from
  `specialized-motion` and make their authority fields mutually exclusive.
- Package and Registry Subject Definitions are correlated by one discriminated
  request union. Package-only `mountSlots` do not leak into Registry contracts.
- Canonical JSON helpers are publicly owned by `@whitebox-world/protocol`, and
  Authoring exposes one schema subpath.
- Babylon Native admission remains provider-owned in `runtime-babylon`; this
  change does not expand Native Modules into Runtime, Physics, Gameplay, input,
  camera, or tick ownership.

## Design-principle conformance

| Principle | Accepted implementation | Evidence boundary |
| --- | --- | --- |
| One state owner | CharacterMovement owns planar movement and Locomotion; BodyPort owns support; RuntimeHost owns the fixed-Tick commit barrier. | Structural gate plus prepare/commit/abort/reset/replay regressions. |
| Clean break while unreleased | The old fixed-input method, flat Locomotion V1 parser, duplicate schema subpath, and Authoring canonical-JSON facade are deleted with their consumers. | Typecheck, parser rejection, package exports, and zero legacy census. |
| Capability over presentation | Controller admission uses the control strategy, never static-versus-rigged visuals. | Static and rigged subjects share CharacterMovement tests; specialized strategies reject planar input. |
| Fail closed | Invalid prepare is aborted; abort failure closes the Session; initialization support failure disposes the partial Runtime. | RuntimeHost transaction and Babylon partial-construction regressions. |
| Deterministic evidence | Initial support, tick support, reset, abort, replay, rollback, mounted masks, and Semantic Facts derive from the committed BodyPort sample. | Runtime support and mounted/replay regressions. |
| Provider isolation | Native scene code remains visual/static-collider contribution only; no second Runtime, Physics, Gameplay, Camera, input, or tick owner is introduced. | Existing Native admission contract and unchanged ADR-0007 boundary. |
| Frozen-input integrity | Representative Builder Skill inputs remain byte-identical to the live Skill. | `pnpm check:native-block-builder-skill`. |

## Failure prevention

`pnpm verify:3c-migration` now checks fixed-input port shape, V2-only Locomotion,
disjoint movement ownership, and unique Authoring public entries in addition to
the historical symbol census. `AGENTS.md` requires capability-based authority
selection, bounded clean-break migrations, semantic structural gates, and
byte-identical updates to frozen representative Skill inputs.

## Verification record

The latest failing `main` run (`33748582656`, SHA `7d5fcbdf...`) had one failed
test: the representative Native Block Builder Skill freeze differed from the
live Skill. The current change synchronizes that frozen input and its paired
output-contract reference; the dedicated 26-test drift gate passes.

Focused local evidence before freezing the candidate:

- affected Runtime suites: 368/368 pass, including initialization support,
  unsupported Spawn, fixed Tick, abort, replay, reset, and mounted state;
- changed-file focused suites: 794 pass and 3 intentional skips, followed by
  the final Gameplay parser suite at 287/287 and the structural verifier suite
  at 67 pass with 3 intentional skips;
- `pnpm typecheck`, `pnpm verify:3c-migration`,
  `pnpm verify:runtime-authority-boundaries`,
  `pnpm verify:workspace-boundaries`, `pnpm check:agent-self-check`, and
  `pnpm check:runtime-contract-validators` pass;
- `git diff --check` passes.

The exact candidate SHA, Cursor full gate, independent review, and final
integration result are recorded after the candidate is frozen.
