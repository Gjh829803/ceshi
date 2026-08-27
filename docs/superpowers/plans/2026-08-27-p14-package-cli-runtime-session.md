# P1.4 Package CLI and Persistent Runtime Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is main-agent-only because it migrates public CLI command semantics, freezes a durable Runtime Session protocol, and composes Package verification, Babylon/Havok ownership, and crash recovery across shared boundaries.

**Goal:** Finish the remaining P1.4 Package CLI and persistent Runtime Session rows with one canonical CLI dialect, a provider-neutral request/receipt protocol, durable Request ID replay, fresh-process recovery, and exact Runtime ownership cleanup.

**Architecture:** `worldkit build` becomes the canonical complete WorldPackage V2 directory publisher required by the overall design; the previous single `worldkit-build-artifact` writer remains only an internal trusted-host helper for workflows that still need that intermediate artifact. `worldkit inspect` independently verifies a Package without constructing Runtime state, `worldkit load` verifies and reaches a headless World Ready Gate before immediately disposing, and `worldkit run <package-directory> --interactive --protocol ndjson --headless` owns a long-lived `RuntimeHost`. A closed provider-neutral protocol lives with the existing public Runtime/Browser DTOs in `@whitebox-world/runtime-contracts`; `@whitebox-world/runtime-host` implements execution without owning the transport schema. Node filesystem durability, Havok loading, process signals, and NDJSON framing stay under `scripts/lib`. Recovery replays the exact admitted Package and committed mutations into a fresh Runtime, verifies byte-identical receipts/snapshots, and never trusts a cloud/browser process handle as durable state.

**Tech Stack:** TypeScript, Vitest, pnpm workspace, Canonical JSON JCS V1, SHA-256, hash-chained fsynced NDJSON WAL, Babylon.js `NullEngine`, Havok WASM, Node ESM filesystem/process adapters.

**Spec:** `docs/18-refactor-progress-and-backlog.md` P1.4; `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md` §16.1–§16.3 and §19–§20; `docs/superpowers/specs/2026-08-19-simulation-take-control-capture-design.md` Runtime Session lifecycle and recovery identity; `docs/reviews/2026-08-27-p14-complete-world-package-v2-completion.md` verified Package foundation. This plan is not a new authority for P1.6 publication or Incremental mode.

## Global constraints

- Browser Protocol V5 remains exact 39 keys. Runtime Session is CLI NDJSON and is never installed on `window.__WORLDKIT__`.
- `authoring-host` must not depend on `runtime-host`; Node composition owns any future P1.6 bridge.
- The P1.6 design header remains `Detailed design；implementation not started` and is not edited by this plan.
- Do not start P16-I1 or P16-G2. Incremental still requires its own approved implementation plan.
- No `rebaseRequired` field or alias. P1.6 base mismatch remains `WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH`.
- Public records are closed and reject unknown/missing fields, symbol keys, accessors, negative zero, duplicate JSON keys, unsafe integers, aliases, and non-canonical ordering.
- Use `===` / `!==`; use `lodash-es` `isNil` / `isEmpty` for nullish and emptiness checks.
- Package admission always completes path safety, exact inventory, byte/hash, Package Root, Manifest/closure, signature policy, Host compatibility, and Runtime configuration construction before creating a Babylon adapter.
- Runtime Session V1 has exactly the already implemented single fixed-input controller. It does not add `controller.create`, multi-controller batching, Camera Driver, or P2.4 capability.
- Every committed mutation is serialized through one executor and durably records Request, Request Hash, and Receipt before the next request is admitted.
- Resume reuses the logical `runtimeSessionId` and initial `worldSessionId`, rebuilds from the exact Package Root, and replays committed mutations in order. A different Package Root or divergent replay fails closed.
- `SIGINT`, `SIGTERM`, explicit close, crash, and partial WAL tail have distinct tests. Only an unterminated final WAL row may be truncated; a corrupt complete row is fatal.
- World disposal is exactly once. A replacement or resumed Runtime cannot report ready until the old ownership ledger is empty and the new Runtime has passed its World Ready Gate.
- stdout for one-shot commands is one stable JSON document; stdout for interactive run is canonical NDJSON only. Human diagnostics and progress use stderr.
- Every new one-shot JSON result carries the §16 envelope `protocolVersion`, `sdkVersion`, `specVersion`, and `command`; Runtime Session records carry both their DTO `schemaVersion` and stream `protocolVersion`.
- The first interactive event is `ready` and includes a stable logical `worldkit://runtime-session/<runtimeSessionId>` URL in the canonical `runtimeSessionUri` field. It does not claim that a headless stdio session owns an HTTP listener.
- Plain `pnpm dev + ?authoring=1` is never introduced. The existing trusted `worldkit run <world.json>` authoring Browser route remains separate from Package headless sessions.

## Work graph and exclusive ownership

| ID | Deliverable | `depends_on` | `blocks` | Exclusive ownership | Mode |
| --- | --- | --- | --- | --- | --- |
| P14-RS-01 | Closed Runtime Session V1 transport | P14-PKG-07 | P14-RS-04, P14-RS-05, P14-RS-06 | `packages/runtime-contracts/src/runtime-session-protocol*` | main-agent-only |
| P14-RS-02 | Durable Runtime Session WAL | P14-RS-01 | P14-RS-05, P14-RS-06 | `scripts/lib/runtime-session-wal*` | sequential |
| P14-RS-03 | Canonical Package build/inspect/load core | P14-PKG-07 | P14-RS-04, P14-RS-06 | `scripts/lib/world-package-cli*` | sequential |
| P14-RS-04 | Headless Babylon/Havok Runtime composition and ownership ledger | P14-RS-01, P14-RS-03 | P14-RS-05 | `scripts/lib/headless-runtime-session*` | main-agent-only |
| P14-RS-05 | Recovery-aware Runtime Session executor | P14-RS-02, P14-RS-04 | P14-RS-06, P14-RS-07 | `scripts/lib/runtime-session-executor*` | main-agent-only |
| P14-RS-06 | Public CLI and NDJSON process adapter | P14-RS-03, P14-RS-05 | P14-RS-07 | `scripts/lib/runtime-session-ndjson*`, `scripts/worldkit*`, internal build-artifact call sites | main-agent-only |
| P14-RS-07 | Fresh-process evidence and P1.4 truth update | P14-RS-06 | later P1.6 trusted-host recovery plan | integration evidence and P1.4 docs only | main-agent-only |

## Task 1: Freeze Runtime Session V1 transport (`P14-RS-01`)

**Deliverable:** Provider-neutral closed Request, Receipt, Event, parser, canonicalizer, and hash exports that reuse current public Gameplay and Runtime DTOs without exposing `runtime-host` internals, Babylon, filesystem, process, or Browser concepts.

**Files:**

- Create: `packages/runtime-contracts/src/runtime-session-protocol.ts`
- Create: `packages/runtime-contracts/src/runtime-session-protocol.test.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `packages/runtime-host/src/world-session.ts`

**Input/output contract:**

- Request common fields: `kind: "worldkit-runtime-session-request"`, `schemaVersion: 1`, `id`, `runtimeSessionId`, and closed `type`.
- V1 request types: `gameplay-command.execute`, `fixed-input.run`, `snapshot.get`, `events.get`, and `session.close`.
- Mutation payloads are the existing exact `GameplayCommandV1` and singular `FixedInputV1`; no translated parameter bag.
- Receipt common fields bind `id`, `requestId`, `requestHash`, `runtimeSessionId`, `worldSessionId`, `requestType`, and `status`; succeeded payloads reuse exact existing Gameplay receipt, public `WorldRuntimeSnapshotV4`, event page, or close result. Rejections contain one stable diagnostic.
- Event common fields: `kind: "worldkit-runtime-session-event"`, `schemaVersion: 1`, derived `id`, `protocolVersion`, monotonic `sequence`, and `runtimeSessionId`; types are `ready`, `completed`, and `failed`.
- `ready` binds logical `runtimeSessionUri`, `worldSessionId`, `worldPackageRef`, `worldPackageRootHash`, `fixedInputControllerEntityId`, and the exact supported request-type list.
- Add closed `parseFixedInputV1` and `parseWorldRuntimeSnapshotV4` exports beside their existing public DTOs. `runtime-host` removes its private FixedInput dialect and consumes the public parser.

- [x] Write RED happy-path/exact-key/adversarial tests, including aliases, accessor/symbol keys, negative zero, wrong nested Gameplay/FixedInput/Snapshot DTOs, unsorted event pages, derived Receipt/Event IDs, and Request Hash domain separation.
- [x] Run `pnpm exec vitest run packages/runtime-contracts/src/runtime-session-protocol.test.ts` and capture the missing-export failure.
- [x] Implement the closed unions plus `parseRuntimeSessionRequestV1`, `canonicalRuntimeSessionReceiptV1`, `canonicalRuntimeSessionEventV1`, and `hashRuntimeSessionRequestV1`.
- [x] Run `pnpm exec vitest run packages/runtime-contracts/src/runtime-session-protocol.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts packages/runtime-host/src/runtime-host.test.ts packages/runtime-host/src/world-session.test.ts`.
- [x] Run `pnpm typecheck`.
- [x] Commit: `feat(runtime-host): freeze runtime session protocol`.

## Task 2: Add the durable Runtime Session WAL (`P14-RS-02`)

**Deliverable:** A Node-only, absolute-path, owner-private, hash-chained transaction log that reconstructs session identity and committed Request/Receipt pairs across processes.

**Files:**

- Create: `scripts/lib/runtime-session-wal.ts`
- Create: `scripts/lib/runtime-session-wal.test.ts`

**Input/output contract:**

- Transactions are `session-opened`, `request-committed`, and `session-closed`.
- `session-opened` binds Runtime Session ID, initial WorldSession ID, Package Ref/Root, protocol version, and creation sequence; it never stores local paths or credentials.
- `request-committed` stores the exact canonical Request, Request Hash, and Receipt as one transaction.
- `session-closed` stores the final event and forbids further requests.
- Each canonical NDJSON row binds previous-row hash and row hash. Append fsyncs the file; creation and first publication also fsync the parent directory.

- [x] Write RED tests for first open, append/reopen, same Request ID replay, changed-content conflict, concurrent append serialization, owner modes, relative/symlink rejection, corrupt complete rows, duplicate sequence, torn tail truncation, and closed-session admission.
- [x] Run `pnpm exec vitest run scripts/lib/runtime-session-wal.test.ts` and capture RED.
- [x] Implement `createFileRuntimeSessionWalV1`, `openFileRuntimeSessionWalV1`, and a narrow test-hook factory; reuse canonical JSON/hash utilities rather than custom JSON sorting.
- [x] Run `pnpm exec vitest run scripts/lib/runtime-session-wal.test.ts scripts/lib/file-world-change-journal.test.ts scripts/lib/file-world-package.test.ts`.
- [x] Run `pnpm typecheck` and `pnpm test:census`.
- [x] Commit: `feat(runtime-session): add durable request journal`.

## Task 3: Implement canonical Package build, inspect, and load core (`P14-RS-03`)

**Deliverable:** One trusted service layer for the public Package commands. Build emits an atomic V2 directory; inspect independently verifies it; load constructs the exact verified Runtime configuration and never reads mutable Registry state afterward.

**Files:**

- Create: `scripts/lib/world-package-cli.ts`
- Create: `scripts/lib/world-package-cli.test.ts`
- Reuse: `scripts/lib/trusted-world-package-v2.ts`
- Reuse: `scripts/lib/file-world-package.ts`

**Input/output contract:**

- Build consumes `loadWorldkitRoutePipeline`, `resolveTrustedWorldPackageResourceArtifactsV2`, `createTrustedWorldPackageBuildContextV2`, `createWorldPackageV2`, and `writeWorldPackageDirectoryV2`.
- Build refuses an existing destination and returns a stable summary binding Package Ref/Root and Manifest/ExecutionPlan/Registry Lock hashes.
- Inspect uses `readWorldPackageDirectoryV2` plus Host compatibility/signature policy admission and returns stable package facts without constructing any adapter.
- Load uses the same verification result to produce `RuntimeWorldConfigurationV1`; no asset or Registry lookup occurs after package verification.
- All three public results use the §16 one-shot envelope and stable exit-code mapping; no stack or absolute local path enters the protocol result.

- [x] Write RED tests for basic and G Bot builds, deterministic roots, existing destination, flipped Manifest/GLB bytes, missing file, symlink, unsupported Host profile, and an adapter sentinel proving inspect/verification happens before Runtime construction.
- [x] Run `pnpm exec vitest run scripts/lib/world-package-cli.test.ts` and capture RED.
- [x] Implement `buildWorldPackageDirectoryV2`, `inspectWorldPackageDirectoryV2`, and `loadRuntimeWorldConfigurationFromPackageDirectoryV1` with bounded file-count/byte budgets.
- [x] Run `pnpm exec vitest run scripts/lib/world-package-cli.test.ts scripts/lib/file-world-package.test.ts packages/world-package/src/v2-directory.test.ts packages/world-package/src/host-admission.test.ts`.
- [x] Run `pnpm typecheck`.
- [x] Commit: `feat(worldkit): add complete package command core`.

## Task 4: Compose the headless Runtime and exact ownership ledger (`P14-RS-04`)

**Deliverable:** A real Babylon/Havok `RuntimeHost` composition that reaches a World Ready Gate, owns every Runtime resource explicitly, and disposes all resources exactly once on partial construction, close, replacement, or failure.

**Files:**

- Create: `scripts/lib/headless-runtime-session.ts`
- Create: `scripts/lib/headless-runtime-session.test.ts`
- Create: `packages/runtime-babylon/src/world-runtime-snapshot.ts`
- Modify: `packages/runtime-babylon/src/index.ts`
- Modify: `apps/playground/src/gameplay-babylon-runtime-coordinator.ts`

**Input/output contract:**

- Create Babylon `NullEngine` with deterministic lockstep and load the installed Havok WASM through Node ESM resolution.
- Resolve Subject bytes only from verified Package `resourceBytesByRef`.
- Compose `BabylonWorldRuntime`, `createBabylonGameplayWorldPortV1`, the Package-locked gameplay factories, one participant/controller, and `RuntimeHost`.
- Extract the existing Playground `WorldRuntimeSnapshotV4` join into one shared Runtime-Babylon projection helper; Browser and Headless Hosts must not maintain parallel camera or Subject projection truths.
- The ownership ledger tracks engine, scene/runtime, gameplay port, RuntimeHost, and package-backed asset resolver. `ready` is impossible until all are constructed and the initial Runtime snapshot binds the admitted Package identity.
- Dispose marks each owned resource once, drains Runtime activity, empties the ledger, and reports aggregate cleanup diagnostics without masking the primary failure.

- [x] Write RED tests for real basic and G Bot packages plus adversarial partial failures at engine, Havok, runtime, gameplay-port, WorldSession, and ready-gate stages.
- [x] Add disposal-order, double-close, throwing-cleanup, 30/60/120-like fixed-input timing, multi-instance isolation, and empty-ledger-before-next-create assertions required by the runtime deep-review checklist.
- [x] Run `pnpm exec vitest run scripts/lib/headless-runtime-session.test.ts` and capture RED.
- [x] Implement `createHeadlessRuntimeSessionV1` and `loadHeadlessWorldPackageV1`; use a narrow injected factory set only for failure tests.
- [x] Run `pnpm exec vitest run scripts/lib/headless-runtime-session.test.ts packages/runtime-babylon/src/runtime.test.ts packages/runtime-host/src/runtime-host.test.ts`.
- [x] Run `pnpm typecheck`.
- [x] Commit: `feat(runtime-session): compose headless babylon host`.

## Task 5: Implement recovery-aware Runtime Session execution (`P14-RS-05`)

**Deliverable:** One serialized executor that atomically combines Runtime mutation and durable Request/Receipt semantics, supports byte-identical replay, and reconstructs state in a fresh process from the exact Package and WAL.

**Files:**

- Create: `scripts/lib/runtime-session-executor.ts`
- Create: `scripts/lib/runtime-session-executor.test.ts`

**Input/output contract:**

- New-session creation fixes Runtime Session ID and initial WorldSession ID before Runtime construction and writes `session-opened` only after World Ready.
- Existing Request ID + same Request Hash returns the stored byte-identical Receipt without invoking Runtime.
- Existing Request ID + different Request Hash returns a stable conflict diagnostic.
- A new request invokes exactly one Runtime operation; mutation Receipts are durably committed before the executor admits the next request.
- Resume verifies Package Ref/Root, recreates the same logical IDs, replays committed mutation requests in sequence, and compares generated Receipt/publication bytes with the WAL. Divergence fails closed before `ready`.
- Observation requests may be retained for Request ID replay but never alter reconstruction state. `session.close` writes the final transaction after exact disposal.

- [x] Write RED tests for each request type, serialization, duplicate replay, conflict, failed mutation, crash after Runtime result/before WAL append, crash after WAL append, close, and replay divergence.
- [x] Run `pnpm exec vitest run scripts/lib/runtime-session-executor.test.ts` and capture RED.
- [x] Implement `createRuntimeSessionExecutorV1` and `resumeRuntimeSessionExecutorV1`; expose no filesystem or Babylon handles in public results.
- [x] Run `pnpm exec vitest run scripts/lib/runtime-session-executor.test.ts scripts/lib/runtime-session-wal.test.ts scripts/lib/headless-runtime-session.test.ts`.
- [x] Run `pnpm typecheck`.
- [x] Commit: `feat(runtime-session): add durable replay executor`.

## Task 6: Migrate the public CLI and add the NDJSON process adapter (`P14-RS-06`)

**Deliverable:** The one canonical CLI dialect required by §16, including a clean migration away from the public single-file Build artifact and a bounded long-lived stdin/stdout protocol.

**Files:**

- Create: `scripts/lib/runtime-session-ndjson.ts`
- Create: `scripts/lib/runtime-session-ndjson.test.ts`
- Modify: `scripts/worldkit.ts`
- Modify: `scripts/worldkit.test.ts`
- Create: `scripts/build-world-artifact.ts` for trusted-host internal workflows only
- Modify: `scripts/run-spatial-world-agent.sh`
- Modify: `scripts/verify-canonical-world.ts`
- Modify: `scripts/verify-rigged-subject-world.ts`
- Modify: `scripts/verify-g-bot-subject-world.ts`
- Modify: `README.md`
- Modify: `docs/17-canonical-json-quickstart.md`

**Canonical commands:**

```bash
worldkit build <world.json> --output <package-directory> --json
worldkit inspect <package-directory> --json
worldkit load <package-directory> --headless --json
worldkit run <package-directory> --interactive --protocol ndjson --headless \
  --session-directory <absolute-directory> [--resume]
```

The existing `worldkit run <world.json> [--port ...]` remains the trusted authoring Browser route. Dispatch is by verified input kind, not extension guessing. The old `worldkit-build-artifact` producer remains callable only by the named internal script and is not given a second public CLI alias.

- [x] Write RED parser/help tests for the exact commands and invalid flag combinations; reject `--interactive` without `--protocol ndjson --headless`, `--resume` without an existing session, and Package input on Browser-only flags.
- [x] Write RED stream tests for first `ready`, canonical one-line receipts, malformed JSON, duplicate keys, overlong line/input budget, EOF, explicit close, SIGINT, SIGTERM, backpressure, and final `completed`/`failed` event.
- [x] Run `pnpm exec vitest run scripts/worldkit.test.ts scripts/lib/runtime-session-ndjson.test.ts` and capture RED.
- [x] Implement bounded line framing and a sequential writer; stdout receives protocol records only and stderr receives human diagnostics only.
- [x] Migrate `worldkit build` to V2 directory publication; route inspect/load/run to the shared services; move existing Build artifact code and formal hosted-workflow callers to the internal script without changing artifact bytes.
- [x] Update canonical verifiers and quickstart to treat the Package directory as the public Build output while retaining explicit internal artifact evidence where required by Studio.
- [x] Run `pnpm exec vitest run scripts/worldkit.test.ts scripts/lib/runtime-session-ndjson.test.ts scripts/worldkit-route-run.integration.test.ts apps/studio/server.test.mjs`.
- [x] Run `pnpm typecheck`, `pnpm test:census`, and `pnpm verify:workspace-boundaries`.
- [x] Commit: `feat(worldkit): publish durable runtime sessions`.

## Task 7: Prove fresh-process recovery and close only the evidenced P1.4 rows (`P14-RS-07`)

**Deliverable:** Real child-process evidence for asset-free and rigged worlds, corruption and crash recovery, exact disposal, full repository gates, and a truth-preserving completion record.

**Files:**

- Create: `scripts/runtime-session.integration.test.ts`
- Create: `docs/reviews/2026-08-27-p14-runtime-session-completion.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `docs/02-sdk-architecture.md`

- [x] In process A, build basic and G Bot Package directories; in process B, inspect and load each Package and verify the same Package Ref/Root with no Registry reads after admission.
- [x] Start an interactive process, consume `ready`, submit at least one gameplay command and fixed-input batch, capture a snapshot, repeat a Request ID and prove byte-identical output, then kill without close.
- [x] Resume in a new process with the same session directory; prove the same logical Runtime/World Session IDs, equal reconstructed snapshot, continued sequence, exact duplicate replay, and successful explicit close.
- [x] Flip one complete WAL byte and one Package resource byte and prove fail-closed before `ready`; separately leave an unterminated WAL tail and prove bounded truncation plus successful replay.
- [x] Prove SIGINT and SIGTERM each dispose the ownership ledger and emit exactly one final event; prove abrupt kill emits no false completion.
- [x] Run focused Runtime Session tests, then `pnpm typecheck`, `pnpm verify:workspace-boundaries`, `pnpm test:census`, `pnpm test`, `pnpm build`, and the canonical/G Bot verifiers once on the final tree.
- [x] Audit exact Browser V5 key count, forbidden `authoring-host -> runtime-host` dependency, `rebaseRequired`, `===`/`!==`, nullish/empty checks, public CLI aliases, P1.6 spec byte stability, and leftover temporary/session directories.
- [x] Write the completion record separating contract evidence, fresh-process evidence, rendered evidence, and manual interaction evidence. Mark only the three P1.4 rows proven by this plan; leave P1.6 trusted-host startup publication recovery, cleanup retry, dual Provider round-trip, manual playtest, and Incremental explicitly open.
- [x] Commit: `docs(runtime-session): record p14 completion evidence`.

## Explicit non-claims and next dependency

Completion of this plan proves complete Package CLI plus persistent headless Runtime Session lifecycle and recovery. It does **not** by itself wire the browser-resident Playground Authoring Edit Host to a filesystem WAL, retry a P1.6 scheduled cleanup after restart, add Provider conformance, close manual playtest, or authorize Incremental. The next P1.6 plan must use this durable trusted Node Host boundary to own startup publication reconciliation and cleanup retry; it must not fake durability with browser `localStorage` or move Playground policy into `RuntimeHost`.
