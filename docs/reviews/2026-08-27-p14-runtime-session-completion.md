# P1.4 Package CLI and Persistent Runtime Session Completion Record

## Status

- Date: 2026-08-27.
- Branch: `codex/p16-world-changeset-followup`.
- Disposition: **P14-RS-01 through P14-RS-07 complete**.
- Scope: canonical WorldPackage V2 `build` / `inspect` / `load` commands,
  persistent headless Runtime Session V1, canonical NDJSON request/receipt
  transport, durable Request ID replay, fresh-process recovery, and exact
  Runtime ownership cleanup.
- Authority:
  [`P1.4 Package CLI and Persistent Runtime Session implementation plan`](../superpowers/plans/2026-08-27-p14-package-cli-runtime-session.md).
- Package prerequisite:
  [`P1.4 Complete WorldPackage V2 completion record`](2026-08-27-p14-complete-world-package-v2-completion.md).
- P1.6 authority status remains *Detailed design；implementation not started*.

This record closes the three remaining P1.4 backlog rows. It does not claim a
P1.6 production GO, Incremental Hot Apply, complete Replay/Resume for every
future Capture or multiplayer workflow, or manual interaction evidence.

## Implemented work graph

| Work unit | Commit | Verified deliverable |
| --- | --- | --- |
| P14-RS-01 | `f5246da` | Closed provider-neutral Runtime Session Request, Receipt, Event, parser, canonicalization, and hash contracts |
| P14-RS-02 | `41c0538` | Owner-private, hash-chained, fsynced NDJSON WAL with exact torn-tail policy |
| P14-RS-03 | `cb8aaf7` | Canonical complete Package build, independent inspect, and verified load services |
| P14-RS-04 | `58edc65` | Real headless Babylon/Havok Runtime composition, shared Snapshot projection, and exact ownership ledger |
| P14-RS-05 | `997c93f` | Serialized executor, durable Request ID replay, divergent-replay rejection, and fresh-process reconstruction |
| P14-RS-06 | `cd633e7` | Public CLI migration and bounded canonical NDJSON process adapter |
| P14-RS-07 | this completion commit | Fresh-process, corruption, signal, rendered, full-gate, and truth evidence |

Runtime Session remains a CLI/stdio Host protocol. Browser Protocol V5 remains
exactly 39 keys and does not expose a Runtime Session alias.

## Contract evidence

- `worldkit build <world.json> --output <package-directory> --json` atomically
  publishes a complete verified WorldPackage V2 directory. The previous
  single-file build artifact remains an explicitly named trusted-host internal
  script, not a second public CLI dialect.
- `worldkit inspect` independently verifies Package inventory, bytes, Root,
  legal closure, signature policy, and Host compatibility without constructing
  Runtime state.
- `worldkit load --headless` reaches the real World Ready Gate from verified
  Package bytes, then disposes every Runtime owner.
- `worldkit run <package-directory> --interactive --protocol ndjson --headless`
  publishes one canonical `ready` event, serializes closed Requests, emits one
  canonical Receipt per admitted Request, and terminates with one `completed`
  or `failed` event.
- Every committed mutation durably binds the exact Request, Request Hash, and
  Receipt before the next Request is admitted. Same-ID/same-hash replay returns
  byte-identical output without re-execution; changed content fails closed.
- Resume verifies the exact Package Ref/Root, reconstructs the same logical
  Runtime/World Session IDs, replays committed mutations in order, and rejects
  any Receipt or Snapshot divergence before `ready`.
- A corrupt complete WAL row is fatal. Only an unterminated final row is
  truncated. A changed Package resource fails admission before Runtime ready.
- `SIGINT`, `SIGTERM`, explicit close, partial construction, and throwing
  cleanup drain the ownership ledger and dispose each owner exactly once.
  Abrupt `SIGKILL` emits no false completion.

## Fresh-process evidence

`scripts/runtime-session.integration.test.ts` uses real child processes and
disposable absolute Package/Session directories. All five integration tests
passed:

1. Process A built basic and G Bot packages; process B independently inspected
   and loaded both with the same Package Ref/Root.
2. An interactive process committed control binding and fixed input, returned a
   Snapshot, replayed a duplicate Request byte-for-byte, then was killed without
   a final event.
3. A fresh process resumed the same logical IDs, reconstructed the same
   Snapshot, replayed the retained Receipt exactly, continued to a later Tick,
   and closed successfully.
4. Complete-row WAL corruption and Package resource drift failed before ready;
   an unterminated tail was truncated and recovered.
5. `SIGINT` and `SIGTERM` each produced exactly one final Event and one durable
   `session-closed` transaction.

## Rendered and existing-scene evidence

- `pnpm verify:canonical`: passed Browser V5, package-subject movement,
  collision, water boundary, control switch, deterministic reset, and an
  846×475 rendered screenshot.
- `pnpm verify:placement-layout`: passed all 19 constraints, deterministic
  layout/build agreement, reset to a new WorldSession, and an 846×475 rendered
  screenshot with eight sampled RGB colors.
- `pnpm verify:rigged-subject`: passed real GLB loading, independent Subject
  state, wall collision, and distinct idle/walk/run/jump pose captures.
- `pnpm verify:g-bot-subject`: passed the product G Bot Package, independent
  instances, wall collision, jump/landing, and distinct idle/walk/run/jump
  captures.
- The complete resource-heavy lane recompiled the existing grassland,
  azure-bay, canyon, mistbound-rider, mounted-skateboard, sunlit-flower-bay,
  and world-08170639-54db catalog scenes through Authoring V4 and ExecutionPlan
  V5. Terrain samples, spawn facing, camera framing, and deterministic identities
  remained valid.
- The real Full Reload browser test committed add-house and verified that the
  newly published house changed both Runtime and page screenshots.

The capture commands used headless Chromium/SwiftShader in this environment;
software-renderer warnings are retained as environment evidence and are not
claimed as hardware performance evidence.

## Startup race found during completion review

The first Placement gate exposed a real startup race: Browser `ready()` could
resolve while the internal authoring workbench was still setting up. An
immediate external `reset()` activated the Browser reset fence; the workbench
then attempted an externally fenced Snapshot read, treated setup as failed, and
disposed the RuntimeHost.

The fix keeps the Browser fence unchanged. Internal workbench setup now uses
the Adapter-owned initial Snapshot for initial UI state and falls back to that
display-only Camera state while reset is in progress. The new real-browser
regression proves that a reset started immediately after `ready()` changes the
WorldSession, leaves Tick at zero, preserves page status `ready`, and retains
one live world canvas.

## Full verification on the final implementation tree

```bash
pnpm exec vitest run <eight focused Runtime Session files>
pnpm typecheck
pnpm verify:workspace-boundaries
pnpm test:census
pnpm test
pnpm build
pnpm test:resource-heavy
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

Observed results:

- Focused Runtime Session group: 8 files / 88 tests passed.
- TypeScript: exit 0.
- Workspace boundary verifier: passed; the registered debt floor remains 51.
- Census: 264 files, split into 236 contract and 28 resource-heavy files.
- Contract lane: 236 files / 2,410 tests passed.
- Resource-heavy lane: 28 files / 445 tests passed.
- Production Playground build: 2,245 modules transformed, exit 0.
- Planner and Builder tracked self-check bundles match canonical generated
  output and run independently from the repository dependency graph.
- Browser authoring edit test confirms Browser Protocol V5 exact 39 keys.
- `authoring-host` has no dependency on `runtime-host`; the workspace boundary
  gate passed.
- `rebaseRequired` appears only in negative tests proving rejection. Base
  mismatch remains `WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH`.
- The P1.6 design header and body were unchanged by this implementation.
- No verifier-owned Package, Runtime Session, or artifact staging directory was
  left behind.

## Manual interaction evidence

No manual keyboard/mouse playtest was run for this completion record. Rendered
Chromium evidence and fixed-input Runtime evidence are automated evidence only.
This record does not convert them into a manual-playtest claim.

## Explicitly open after P1.4

- P1.6 trusted Host startup publication reconciliation and scheduled cleanup
  retry across restart.
- P1.6 definition-override-set journal O1 integration and any remaining journal
  ownership work.
- Dry Run Validation Report population and stronger fence/Snapshot guarantees.
- Dual Provider round-trip/conformance.
- Complete P1.4-dependent manual playtest and broader WAL operational exercise.
- P16-I1 and P16-G2 Incremental mode. Incremental still requires its own
  separately approved implementation plan.
