# P1.4 Complete WorldPackage V2 Completion Record

## Status

- Date: 2026-08-27.
- Branch: `codex/p16-world-changeset-followup`.
- Implementation observation point: consumer migration `7d242b8`; full-gate
  performance correction `5faa535`. This evidence document and the two truth
  updates do not change the verified runtime inputs.
- Disposition: **P14-PKG-01 through P14-PKG-07 complete**.
- Scope: complete WorldPackage V2 directory/publication format, independent
  verification, legal and Host compatibility closure, signature policy,
  filesystem publication, content-addressed store, and active trusted consumer
  migration.
- Authority:
  [`P1.4 Complete WorldPackage V2 implementation plan`](../superpowers/plans/2026-08-27-p14-complete-world-package-v2.md).
- P1.6 authority status remains *Detailed design；implementation not started*.

This closes the complete V2 package format prerequisite. It does not close all
of P1.4: `package/inspect/load/run-session` CLI, persistent Runtime Session,
crash recovery, and cleanup ledger remain open. It also does not claim P1.6
production GO or Incremental Hot Apply.

## Implemented work graph

| Work unit | Commit | Verified deliverable |
| --- | --- | --- |
| P14-PKG-01 | `635eae5` | Closed V2 public DTOs, canonical hashes, explicit V1 to V2 migration report |
| P14-PKG-02 | `a00e2d0` | Canonical byte directory assembly and independent owner-parser verification |
| P14-PKG-03 | `d2b89e6` | Trusted world/resource/legal closure and deterministic V2 build |
| P14-PKG-04 | `ad7534f` | Host compatibility matrix and Ed25519 signature/trust adapter |
| P14-PKG-05 | `186be90` | Atomic absolute-directory publication and symlink-safe bounded reads |
| P14-PKG-06 | `7d242b8` | Content-addressed file/IndexedDB stores and all active trusted consumers on V2 |
| P14-PKG-07 | this record | Full gates, fresh-process round trip, corruption evidence, and truth update |
| Full-gate correction | `5faa535` | Defensive owned byte views are admitted once without repeatedly enumerating large typed-array indices |

No tracked generated artifact changed as part of the V2 migration. The real
directory evidence used disposable absolute directories under the operating
system temporary root and removed them after verification.

## Contract and authority result

- `WorldPackageManifestV2` and `WorldPackageBuildReceiptV2` are closed,
  canonical contracts. Package Root covers the exact core JSON, Gameplay
  Bootstrap, legal documents, NOTICE, and every locked resource byte.
- V2 verification rejects non-canonical/duplicate-key JSON, missing or extra
  files, unsafe paths, byte or media-type drift, forged Root, Registry closure
  drift, and incompatible Host policy before Runtime adapter construction.
- Filesystem publication uses content-addressed `sha256/<root-hex>` directories,
  owner-only modes, a cross-process publication lock, bounded waiting,
  idempotent exact-byte replay, and conflict rejection.
- RuntimeHost, Authoring Host, Playground authoring/catalog loaders, Route and
  Capture paths consume verified V2 receipts/configurations. V1 remains named
  V1 only inside migration, tests, and historical contract code; it is not an
  accepted active Runtime configuration.
- Provider-neutral package code contains no production `node:*` import.
  Filesystem and Ed25519 providers remain under `scripts/lib`.

## Automated and build evidence

All commands passed on the exact implementation tree represented by
`7d242b8` + `5faa535`:

```bash
pnpm exec vitest run packages/world-package/src/*.test.ts scripts/lib/world-package-*.test.ts scripts/lib/file-world-package.test.ts
pnpm typecheck
pnpm verify:workspace-boundaries
pnpm test:census
git diff --check
pnpm test
pnpm build
```

Observed results:

- Focused package/migration gates: 9 files / 130 tests passed.
- `pnpm typecheck`: exit 0.
- Workspace boundary verifier: passed.
- Census: 256 files, split into 231 contract and 25 resource-heavy files.
- Contract suite: 231 files / 2,367 tests passed.
- Resource-heavy suite: 25 files / 431 tests passed.
- Combined repository suite: 256 files / 2,798 tests passed.
- Production Vite build: 2,243 modules transformed, exit 0 in 59.02 seconds.
- Browser Authoring Edit installation test passed inside the full suite and
  retained Browser Protocol V5 at exact 39 keys on authoring and catalog pages.

The first full gate exposed a real performance defect: accessor-safe graph
validation enumerated every numeric property of each large `Uint8Array` on
every defensive copy. The correction admits only sealed, SDK-owned defensive
copies through a private module-local `WeakSet`, while external byte views still
receive symbol/accessor, prototype, shared-buffer, and detached-buffer checks.
The focused adversarial tests stayed green; the G Bot package build dropped
from about 14 seconds to 3.8 seconds and the grassland loader from about
80–87 seconds to about 50 seconds. The repository suite and production build
were then rerun and passed.

## Fresh-process real directory round trip

One build process loaded and published these existing authoring fixtures into
two distinct temporary absolute stores:

| Fixture | Package Root | Runtime evidence |
| --- | --- | --- |
| `examples/authoring/basic-world.json` | `sha256:65c054534bc4fee5d478c0389913636222591cdc05703bb68969f7b545e37132` | Fresh store replay, Ref/Root equality, exact ExecutionPlan hash, `RuntimeHost.create`, ready phase |
| `examples/authoring/g-bot-subject-world.json` | `sha256:7db5429c41f369d05bafdbaa487ea81d3bec0e50db9d8e99e560dfb751a2df06` | Same checks with the locked `actor.humanoid.g-bot.glb` bytes |

A second, fresh Vitest process produced 4/4 passing checks:

1. asset-free package replay and Runtime configuration load;
2. rigged G Bot package replay and Runtime configuration load;
3. one flipped `manifest.json` byte rejected with
   `WORLD_PACKAGE_STORE_CORRUPT` before adapter creation;
4. one flipped `resources/subject-assets/actor.humanoid.g-bot.glb` byte rejected
   with the same store-corruption boundary before adapter creation.

For both corruption cases, the adapter factory `create` call count remained
zero. The temporary verifier sources and package directories were deleted after
the run; they are not product CLI functionality or committed artifacts.

## Hard-constraint audit

| Constraint | Result |
| --- | --- |
| Active production V1 consumer | None. Only V1 owner/migration/history code and tests remain. |
| `node:*` in provider-neutral `packages/world-package` | None in production source; test fixtures use `node:fs/promises`. |
| Browser Protocol V5 | Exact 39 keys; no package/session key added to `window.__WORLDKIT__`. |
| `authoring-host` to `runtime-host` dependency | None in package dependencies or production imports; the boundary test remains green. |
| `rebaseRequired` | Absent from production code. The rebase signal remains `WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH`. |
| P1.6 spec header | Byte-unchanged from `f8fda96`; still *Detailed design；implementation not started*. |

## Still open; do not claim closed

- WorldPackage CLI commands `package`, `inspect`, `load`, and `run-session`.
- Persistent Runtime Session protocol, active Host wiring for the existing
  file-backed WorldChange WAL, startup publication recovery, and cleanup retry
  ledger. The package/WAL primitives alone are not an active recovery path.
- Two independent Provider round trips and a human playtest.
- A separately approved Incremental plan and Incremental Hot Apply Slice C.
- Full P1.4 and P1.6 production GO.
