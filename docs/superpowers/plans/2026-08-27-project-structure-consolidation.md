# Project structure consolidation

## Goal

Remove duplicate or tool-named repository authorities while preserving every stable
developer command and all runtime behavior. This is a path and ownership migration;
it does not change Canonical Schema, Browser Protocol, Runtime publication, scene
geometry, or P1.6 completion status.

## Target ownership

- `examples/` owns editable example inputs, templates, and checked-in example evidence.
- `artifacts/` owns formal scene receipts and terrain experiments, not example goldens.
- `docs/superpowers/specs`, `docs/superpowers/plans`, and `docs/superpowers/skills`
  own durable Superpowers-produced documentation. Root `.superpowers` paths are
  workflow state only. Project-wide ADRs and reviews remain under `docs/decisions`
  and `docs/reviews`.
- `scripts/` contains only domain directories plus `README.md`; package script names
  remain the stable developer entry points.
- `apps/playground` and `apps/studio` remain active workspace applications.
  `apps/architecture` is retired because `sites/world-sdk-blueprint` is the current,
  independently gated architecture publication.
- `sites/world-sdk-blueprint` remains an independent npm/Cloudflare site and drops
  unused starter database, auth, example, and default-asset scaffolding.

## Migration map

| Current path | Target path |
| --- | --- |
| `templates/` | `examples/templates/` |
| `artifacts/examples/` | `examples/evidence/` |
| `docs/superpowers/specs/` | unchanged |
| `docs/superpowers/plans/` | unchanged |
| `docs/superpowers/skills/` | unchanged |
| `decisions/` | `docs/decisions/` |
| `.superpowers/sdd/*.md` | descriptive durable reports under `docs/reviews/` |
| root `scripts/*` executables/tests | domain directories under `scripts/` |
| root `apps/studio/*.mjs` | `apps/studio/src/` |

The root scripts domains are `agents`, `assets`, `cli`, `examples`, `scenes`,
`testing`, `verification`, and `visual`. Existing `scripts/lib` and
`scripts/fixtures` remain shared internals and fixtures.

## Explicit non-goals

- Do not modify the P1.6 specification status line or claim production completion.
- Do not add a Browser Protocol key or change Runtime/Provider behavior.
- Do not consolidate source FBX inventories in this change. The legacy vehicle
  catalog contains three unique, hash-locked source files and requires a separate
  asset-authority migration.
- Do not merge `.agents` with `.codex`; they serve different agent hosts and only
  `.codex` is consumed by WorldKit Host gates.

## Verification

1. A focused repository-layout regression rejects old authority paths and root-level
   script executables.
2. Reference census finds no active reference to moved paths.
3. `pnpm check:agent-self-check`, workspace boundary and test census gates pass.
4. Typecheck, root tests, Studio tests, independent Node/Site tests, and Playground
   build pass on the final tree.
5. Canonical, Placement, Rigged Subject, G Bot, Route, and outdoor gameplay verifiers
   exercise the relocated command implementations without updating goldens.
6. The tracked tree remains clean after all check-mode gates.
