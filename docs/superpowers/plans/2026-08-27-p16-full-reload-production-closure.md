# P1.6 Full Reload Production Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining non-Incremental P1.6 Slice B gaps by giving the trusted Host durable startup publication recovery, bounded cleanup retry, a file-backed formal composition, two structured-output Provider round trips, and complete Browser/manual evidence without changing Browser Protocol V5.

**Architecture:** Keep `@whitebox-world/authoring-host` provider-neutral and independent from `runtime-host`. The journal owns durable request/revision/publication-recovery/cleanup facts; an injected trusted-Host runtime recovery port owns rebuilding or resuming the committed Runtime from the exact immutable WorldPackage. A scripts-layer formal composition binds the file WAL, file WorldPackage store, recovery coordinator, and Runtime port; the Playground's in-page bridge remains an explicitly non-production demonstration surface.

**Tech Stack:** TypeScript 5.9, Vitest, Node.js filesystem APIs, canonical NDJSON, Babylon/Havok through the existing RuntimeHost/P1.4 composition, Playwright/Chromium, `lodash-es` named imports.

**Spec:** `docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md` §13.2, §14.2–§14.4, §16.4, §19.1, §19.4, §21, and §22.2.

## Global Constraints

- Do not implement P16-I1 or P16-G2; `fixed-tick` remains `WORLD_CHANGE_PUBLICATION_MODE_UNSUPPORTED`.
- Keep Browser Protocol V5 at exactly 39 keys; Authoring/Edit remains a separate capability-bound object.
- Keep `authoring-host` independent from `runtime-host`; cross-layer composition belongs under `scripts/lib` or the trusted shell.
- Keep `WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH` as the only public rebase signal; never add `rebaseRequired`.
- Do not change the P1.6 specification header from `implementation not started` and do not create a second design authority.
- RuntimeHost owns Runtime lifecycle/CAS/barriers only; it never parses ChangeSets, runs Compiler/Gates, or owns Authoring authorization.
- The committed Receipt is immutable. Publication recovery and cleanup reports may advance, but cannot rewrite or invalidate a committed Receipt or revision.
- Use `===` / `!==`; use named `lodash-es` helpers including `isNil` / `isEmpty` for nullish and collection emptiness checks.
- The formal Host must use an absolute owner-private state directory, a file-backed WorldChange WAL, and the existing verified file WorldPackage store. It must reject symlinked or permission-unsafe state.
- The Browser demo may keep in-memory state only when named and documented as a non-production demo. Production completion evidence must exercise the formal file-backed composition.
- Existing catalog scenes and the Canonical, Placement, Rigged Subject, G Bot, and add-house rendered paths must continue working.

---

### Task 1: Make publication recovery and cleanup progress durable (`P16-R1` follow-up)

**Files:**
- Create: `packages/authoring-host/src/journal/publication-recovery.ts`
- Create: `packages/authoring-host/src/journal/publication-recovery.test.ts`
- Modify: `packages/authoring-host/src/journal/types.ts`
- Modify: `packages/authoring-host/src/journal/store.ts`
- Modify: `packages/authoring-host/src/journal/index.ts`
- Modify: `packages/authoring-host/src/journal/query.ts`
- Modify: `packages/authoring-host/src/journal/publication-adversarial.test.ts`

**Interfaces:**
- Consumes: existing `DurableRequestRecordV1`, committed publish-runtime `WorldChangeReceiptV1`, `WorldChangeCleanupReportV1`, and `WorldChangeJournalWalV1`.
- Produces:

```ts
export interface PendingWorldPublicationRecoveryV1 {
  readonly worldId: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
  readonly requestHash: Sha256HashV1;
  readonly worldPackageRef: WorldPackageRefV1;
  readonly committedReceipt: Extract<
    WorldChangeReceiptV1,
    { readonly status: "committed"; readonly publicationMode: "full-reload" }
  >;
  readonly cleanupReport: WorldChangeCleanupReportV1;
}

export function listPendingWorldPublicationRecoveriesV1(
  journal: WorldChangeJournalV1,
): readonly PendingWorldPublicationRecoveryV1[];

export function markWorldPublicationRecoveredV1(
  journal: WorldChangeJournalV1,
  worldId: string,
  requestId: string,
): void;

export function advanceWorldChangeCleanupReportV1(input: {
  readonly journal: WorldChangeJournalV1;
  readonly authoringEditSessionId: string;
  readonly report: WorldChangeCleanupReportV1;
}): WorldChangeCleanupReportV1;
```

- Add a closed internal journal transaction operation `publication-recovery-state-put` carrying `worldId`, `requestId`, and `status: "pending" | "recovered"`. This operation is Host-private WAL state, not a public Browser/CLI DTO.
- `getAuthoringRevisionHeadV1`, Receipt Query, Explain, and Diff fail closed or remain pending while the exact world has `pending` publication recovery. Cleanup `retrying` alone does not hide an already recovered revision.

- [ ] **Step 1: Write RED tests for recovery visibility and cleanup transitions**

Add tests proving: a reopened WAL with durable commit plus pending publication recovery hides the revision and returns a pending Receipt query; `markWorldPublicationRecoveredV1` atomically exposes the existing committed Receipt/revision without changing Receipt bytes; `scheduled → retrying → released` and `scheduled/retrying → quarantined` are accepted; reverse transitions, changed IDs, decreased/equal attempt counts, and query-triggered attempts are rejected.

- [ ] **Step 2: Run the focused tests and capture RED**

Run:

```bash
pnpm exec vitest run packages/authoring-host/src/journal/publication-recovery.test.ts packages/authoring-host/src/journal/publication-adversarial.test.ts
```

Expected: FAIL because publication recovery is inferred only from a scheduled cleanup report and has no durable completion transition or cleanup state-machine validator.

- [ ] **Step 3: Implement the closed WAL operation and recovery selectors**

Project and validate every WAL operation with exact keys, include the new operation in the hash chain, rebuild the pending map during replay, return frozen defensive values, and sort recoveries by `worldId` then `requestId`.

- [ ] **Step 4: Implement monotonic cleanup advancement**

Require the same `id`, `requestId`, `cleanupOperationId`, and `previousWorldSessionId`; require `attemptCount + 1` for each attempted transition; allow idempotent byte-identical terminal replay; reject every other transition with `WORLD_CHANGE_CLEANUP_REPORT_CONFLICT` as a Host-private error. Queries remain read-only.

- [ ] **Step 5: Run focused tests and package boundaries**

Run:

```bash
pnpm exec vitest run packages/authoring-host/src/journal/publication-recovery.test.ts packages/authoring-host/src/journal/journal.test.ts packages/authoring-host/src/journal/publication-adversarial.test.ts packages/authoring-host/src/package-boundary.test.ts
pnpm typecheck
```

Expected: all pass; `authoring-host` still has no `runtime-host` dependency.

- [ ] **Step 6: Commit**

```bash
git add packages/authoring-host/src/journal
git commit -m "feat(authoring-host): persist publication recovery state"
```

### Task 2: Rehydrate pinned Candidates from the immutable Package store (`P16-P1/R1` follow-up)

**Files:**
- Create: `packages/authoring-host/src/journal/candidate-recovery.ts`
- Create: `packages/authoring-host/src/journal/candidate-recovery.test.ts`
- Modify: `packages/authoring-host/src/journal/recover.ts`
- Modify: `packages/authoring-host/src/journal/index.ts`
- Modify: `packages/authoring-host/src/lease-store.ts`
- Create: `packages/authoring-host/src/lease-store.test.ts`

**Interfaces:**
- Consumes: non-terminal durable record, verified `WorldPackageStoreV1.get()`, stored `buildIdentity`, validation-report hash, original pin, and current exact Policy Hash.
- Produces:

```ts
export async function rehydratePreparedCandidateForRecoveryV1(input: {
  readonly journal: WorldChangeJournalV1;
  readonly leaseStore: PreparedCandidateLeaseStoreV1;
  readonly worldPackageStore: WorldPackageStoreV1;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
  readonly nowUnixMilliseconds: number;
}): Promise<
  | { readonly status: "rehydrated"; readonly preparedCandidateRef: string }
  | { readonly status: "not-required" }
>;
```

- Derive `worldPackageRef` only through `worldPackageRefFromRootHashV1(record.buildIdentity.worldPackageRootHash)`. Never accept a caller-supplied path or Ref.
- Rebuild the in-memory lease only after the stored directory verifies and its receipt hashes exactly match the durable `buildIdentity`. Preserve the original expiration and pin identity; do not extend the lease or mint a second pin.

- [ ] **Step 1: Write RED recovery tests with a fresh lease store**

Cover process-like reopen with the same file WorldPackage store but a new empty lease store, missing/corrupt Package, changed validation-report hash, expired unpinned Candidate, expired pinned Candidate, and duplicate rehydration.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run packages/authoring-host/src/journal/candidate-recovery.test.ts packages/authoring-host/src/journal/journal.test.ts
```

Expected: the existing recovery path fails because it assumes the old in-memory lease store survives restart.

- [ ] **Step 3: Implement verified lease reconstruction**

Use the durable record as identity authority and the verified Package store as byte authority. Reconstruct `PreparedCandidateLeaseV1` with the original session, ChangeSet, Base, Policy, Validation Reports, expiration, and pin; reject divergence before calling `resumeWorldChangeRequestV1`.

- [ ] **Step 4: Integrate rehydration into `recoverWorldChangeRequestV1`**

Run the recovery sweep, rehydrate when required, then resume the same Request ID. A terminal committed/rejected record remains byte-identical and never rebuilds a Candidate.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec vitest run packages/authoring-host/src/journal/candidate-recovery.test.ts packages/authoring-host/src/journal/journal.test.ts packages/authoring-host/src/lease-store.test.ts packages/authoring-host/src/prepared-candidate.test.ts
pnpm typecheck
git add packages/authoring-host/src
git commit -m "feat(authoring-host): rehydrate durable candidate pins"
```

### Task 3: Add a concrete durable Runtime owner and startup coordinator (`P16-H1/F1` follow-up)

**Files:**
- Create: `scripts/lib/durable-world-change-runtime.ts`
- Create: `scripts/lib/durable-world-change-runtime.test.ts`
- Create: `scripts/lib/world-change-publication-recovery.ts`
- Create: `scripts/lib/world-change-publication-recovery.test.ts`
- Modify: `scripts/lib/headless-runtime-session.ts`
- Modify: `scripts/lib/headless-runtime-session.test.ts`
- Modify: `packages/authoring-host/src/journal/types.ts`
- Modify: `packages/authoring-host/src/journal/publication-recovery.ts`
- Modify: `packages/authoring-host/src/journal/index.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: `listPendingWorldPublicationRecoveriesV1`, verified `WorldPackageStoreV1`, and one trusted runtime owner port.
- Produces:

```ts
export interface RecoverCommittedRuntimePublicationPortV1 {
  recover(input: {
    readonly worldId: string;
    readonly requestId: string;
    readonly requestHash: Sha256HashV1;
    readonly worldConfiguration: TrustedRuntimeWorldConfigurationV1;
    readonly committedIdentity: RuntimePublicationIdentityV1;
  }): Promise<
    | { readonly status: "recovered"; readonly identity: RuntimePublicationIdentityV1 }
    | { readonly status: "retryable"; readonly diagnostics: readonly WorldChangeDiagnosticV1[] }
    | { readonly status: "quarantined"; readonly diagnostics: readonly WorldChangeDiagnosticV1[] }
  >;

  retryCleanup(input: {
    readonly cleanupOperationId: string;
    readonly previousWorldSessionId: string;
    readonly attemptCount: number;
  }): Promise<
    | { readonly status: "released" }
    | { readonly status: "retryable"; readonly diagnostics: readonly WorldChangeDiagnosticV1[] }
    | { readonly status: "quarantined"; readonly diagnostics: readonly WorldChangeDiagnosticV1[] }
  >;
}

export interface DurableWorldChangeRuntimeOwnerV1 {
  readonly runtimeSessionId: string;
  publish: PublishRuntimeReplacementV1;
  recoverRuntimePublication: RecoverCommittedRuntimePublicationPortV1;
  snapshot(): WorldRuntimeSnapshotV4;
  dispose(): Promise<void>;
}

export async function createDurableWorldChangeRuntimeOwnerV1(input: {
  readonly runtimeSessionId: string;
  readonly initialWorldSessionId: string;
  readonly initialWorldConfiguration: TrustedRuntimeWorldConfigurationV1;
  readonly initialVerifiedDirectory: VerifiedWorldPackageDirectoryV2;
  readonly worldPackageStore: WorldPackageStoreV1;
}): Promise<DurableWorldChangeRuntimeOwnerV1>;

export async function recoverCommittedWorldPublicationsV1(input: {
  readonly journal: WorldChangeJournalV1;
  readonly worldPackageStore: WorldPackageStoreV1;
  readonly runtimePort: RecoverCommittedRuntimePublicationPortV1;
  readonly maximumCleanupAttemptCount: number;
}): Promise<readonly WorldChangeCleanupReportV1[]>;
```

- The runtime port must return the exact committed Runtime identity. A different RuntimeSession ID, WorldSession ID, Package Root, or non-zero recovery Tick is a fatal divergence and keeps the world fenced.
- A retryable cleanup at the configured attempt limit becomes `quarantined` with `WORLD_CHANGE_CLEANUP_QUARANTINED`. Before the limit it persists `retrying` with `WORLD_CHANGE_CLEANUP_INCOMPLETE`.
- The concrete Runtime owner reuses the existing Babylon/Havok construction and RuntimeHost publication path. Before each candidate create it stages only an already verified WorldPackage configuration keyed by `executionPlanHash`; the RuntimeHost adapter factory cannot read ChangeSets or caller paths.
- On startup recovery the owner rebuilds the committed Package with the exact committed RuntimeSession ID and WorldSession ID at Tick 0 before Host APIs reopen. It does not claim P1.4 request replay as P1.6 publication replay.

- [x] **Step 1: Write RED coordinator tests**

Cover no work, exact recovery, Package missing/corrupt, runtime identity divergence, retryable cleanup then release, retry limit quarantine, two worlds sorted independently, one world failure not exposing that world, and committed Receipt byte stability. The concrete Runtime-owner tests also cover real basic/G Bot Package construction, Full Reload to a second verified Package, old-session disposal, exact Tick 0 identity, multi-owner isolation, partial candidate construction, and throwing cleanup.

- [x] **Step 2: Run RED**

```bash
pnpm exec vitest run scripts/lib/durable-world-change-runtime.test.ts scripts/lib/world-change-publication-recovery.test.ts
```

Expected: FAIL because no durable Runtime owner or startup coordinator exists and the current headless adapter rejects concurrent World residency.

- [x] **Step 3: Implement verified Package reconstruction and runtime recovery**

First factor the existing headless Babylon/Havok handle construction so one RuntimeHost adapter factory can create and own a verified candidate handle without duplicating engine/runtime setup. Then derive the exact Package Ref from the committed build identity, verify the directory, project `executionPlan`, `executionPlanHash`, Build Receipt, and Gameplay Bootstrap into `TrustedRuntimeWorldConfigurationV1`, and call the concrete Runtime owner. Mark publication recovered only after exact identity equality.

- [x] **Step 4: Implement bounded cleanup attempts**

Persist `retrying` before invoking an attempt so process death cannot hide the attempt count. Persist `released` or `quarantined` afterward. Reopening and rerunning continues monotonically from the WAL; Receipt bytes and revision head never change.

- [x] **Step 5: Verify and commit**

```bash
pnpm exec vitest run scripts/lib/durable-world-change-runtime.test.ts scripts/lib/world-change-publication-recovery.test.ts scripts/lib/headless-runtime-session.test.ts packages/authoring-host/src/journal/publication-recovery.test.ts packages/authoring-host/src/journal/publication-adversarial.test.ts
pnpm typecheck
git add scripts/lib/durable-world-change-runtime.ts scripts/lib/durable-world-change-runtime.test.ts scripts/lib/world-change-publication-recovery.ts scripts/lib/world-change-publication-recovery.test.ts scripts/lib/headless-runtime-session.ts scripts/lib/headless-runtime-session.test.ts scripts/lib/test-gate-manifest.ts packages/authoring-host/src/journal
git commit -m "feat(authoring-host): reconcile committed runtime publication"
```

### Task 4: Provide the formal file-backed Host composition and fresh-process proof (`P16-R1/H1/F1` integration)

**Files:**
- Create: `scripts/lib/durable-authoring-edit-host.ts`
- Create: `scripts/lib/durable-authoring-edit-host.test.ts`
- Create: `scripts/durable-authoring-edit-host.integration.test.ts`
- Modify: `scripts/lib/authoring-edit-host-bridge.ts`
- Modify: `scripts/lib/file-world-change-journal.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: absolute `stateDirectoryPath`, initial AuthoringSpec, file WorldPackage limits, build context, resource artifacts, Edit Session, required-gate evaluator, and the concrete `DurableWorldChangeRuntimeOwnerV1` from Task 3.
- Produces:

```ts
export interface DurableAuthoringEditHostV1 {
  readonly bridge: AuthoringEditHostBridgeV1;
  readonly stateDirectoryPath: string;
  readonly runtimeOwner: DurableWorldChangeRuntimeOwnerV1;
  readonly startupCleanupReports: readonly WorldChangeCleanupReportV1[];
}

export async function createDurableAuthoringEditHostV1(input: {
  readonly stateDirectoryPath: string;
  readonly authoringSpec: AuthoringSpecV4;
  readonly worldPackageBuildContext: WorldPackageBuildContextV2;
  readonly resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV2[];
  readonly session: AuthoringEditSessionV1;
  readonly runtimeOwner: DurableWorldChangeRuntimeOwnerV1;
  readonly evaluateRequiredGates?: EvaluateRequiredGatesV1;
  readonly maximumWorldPackageBytes: number;
  readonly maximumWorldPackageFileCount: number;
  readonly maximumCleanupAttemptCount: number;
}): Promise<DurableAuthoringEditHostV1>;
```

- State layout is fixed and Host-private:

```text
<stateDirectoryPath>/
  world-change-journal.wal.ndjson
  world-packages/sha256/<root>/...
```

- The async factory does not return or expose the API until startup publication recovery completes. The state directory must be canonical, non-symlinked, owner-only `0700`; the WAL is `0600`.

- [x] **Step 1: Write RED composition tests**

Cover relative path rejection, symlink rejection, unsafe permissions, exact file modes, reopening the same state, mismatched initial AuthoringSpec/head rejection, and no fallback to in-memory journal.

- [x] **Step 2: Run RED**

```bash
pnpm exec vitest run scripts/lib/durable-authoring-edit-host.test.ts
```

- [x] **Step 3: Implement the formal composition**

Reuse `createFileBackedWorldChangeJournalV1`, `createFileWorldPackageStoreV1`, `createAuthoringEditHostBridgeV1`, `createDurableWorldChangeRuntimeOwnerV1`, and `recoverCommittedWorldPublicationsV1`. Bind the bridge publication port directly to the concrete runtime owner and keep all Node filesystem code outside workspace packages.

- [x] **Step 4: Add a real child-process crash/restart integration test**

Process A performs Dry Run and begins Apply, then exits at each injected boundary: before durable commit, after durable commit/before runtime recovery acknowledgement, and after runtime recovery/before cleanup completion. Process B opens only the same absolute state directory, proves the expected old/new revision visibility, resumes the same Request ID, returns the byte-identical committed Receipt, advances cleanup monotonically, and never creates a second Package/Request/pin.

- [x] **Step 5: Verify and commit**

```bash
pnpm exec vitest run scripts/lib/durable-authoring-edit-host.test.ts scripts/durable-authoring-edit-host.integration.test.ts scripts/lib/authoring-edit-full-reload.integration.test.ts
pnpm typecheck
pnpm verify:workspace-boundaries
git add scripts/lib/durable-authoring-edit-host.ts scripts/lib/durable-authoring-edit-host.test.ts scripts/durable-authoring-edit-host.integration.test.ts scripts/lib/authoring-edit-host-bridge.ts scripts/lib/file-world-change-journal.ts scripts/lib/test-gate-manifest.ts
git commit -m "feat(worldkit): compose durable authoring edit host"
```

### Task 5: Prove two structured-output Provider round trips (`P16-S1/F1` conformance)

**Files:**
- Create: `scripts/lib/ai-schema-provider-conformance.ts`
- Create: `scripts/lib/ai-schema-provider-conformance.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: one canonical `AiSchemaProjectionV1` and canonical `WorldChangeSetV1` fixtures.
- Produces:

```ts
export interface StructuredOutputProviderAdapterFixtureV1 {
  readonly id: string;
  encodeProjection(projection: AiSchemaProjectionV1): unknown;
  decodeCanonicalOutput(output: unknown): unknown;
}

export function verifyStructuredOutputProviderRoundTripV1(input: {
  readonly projection: AiSchemaProjectionV1;
  readonly canonicalOutput: unknown;
  readonly adapters: readonly StructuredOutputProviderAdapterFixtureV1[];
}): readonly Readonly<{
  readonly adapterId: string;
  readonly changeSetHash: Sha256HashV1;
}>[];
```

- Provider payloads and provider-private keywords stay test/private under `scripts/lib`; no Provider name or keyword enters Authoring Schema, AI Projection artifact, ChangeSet, Receipt, generated types, CLI, or Browser API.

- [x] **Step 1: Write RED conformance fixtures**

Use two materially different structured-output envelopes: a strict JSON-schema response envelope and a function/tool declaration envelope. Both must carry the same projected Canonical field names, decode to byte-identical `WorldChangeSetV1`, pass the normal parser/Canonical Validation, and produce the same ChangeSet hash.

- [x] **Step 2: Add adversarial Provider cases**

Reject renamed Canonical fields, provider-private keywords embedded in public artifacts, missing required-null round-trip mappings, enum overflow bypass, unknown operations, and adapters that mutate Registry Refs.

- [x] **Step 3: Run RED, implement the private conformance harness, and run GREEN**

```bash
pnpm exec vitest run scripts/lib/ai-schema-provider-conformance.test.ts packages/authoring-edit/src/schema-projection/schema-projection.test.ts packages/authoring-edit/src/world-change/world-change.test.ts
```

- [x] **Step 4: Audit public surfaces and commit**

```bash
rg -n "openai|anthropic|gemini|providerPayload|input_schema|function_declaration" packages apps/playground/src scripts/worldkit.ts assets/registry
pnpm typecheck
git add scripts/lib/ai-schema-provider-conformance.ts scripts/lib/ai-schema-provider-conformance.test.ts scripts/lib/test-gate-manifest.ts
git commit -m "test(authoring-edit): prove dual provider round trips"
```

Expected audit: provider-specific terms appear only in the private conformance fixture or unrelated pre-existing visual-generation code, never in P1.6 public artifacts.

### Task 6: Close rendered/manual evidence without weakening existing scenes (`P16-F1/G1` evidence)

**Files:**
- Modify: `apps/playground/src/worldkit-authoring-edit-add-house.browser.test.ts`
- Create: `docs/reviews/2026-08-27-p16-full-reload-production-closure.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `README.md`
- Modify: `docs/00-project-overview.md`
- Modify: `docs/02-sdk-architecture.md`
- Modify: `docs/17-canonical-json-quickstart.md`

**Interfaces:**
- Consumes: the formal Host completion evidence, existing add-house/terrain fixtures, Browser Protocol V5, existing scene verifiers, and manual keyboard/mouse interaction.
- Produces: one source-backed completion record separating automated contract, fresh-process, Browser numeric, rendered visual, and manual interaction evidence. It must still state that Incremental is not implemented.

- [ ] **Step 1: Extend Browser evidence only where current coverage is missing**

Prove the old world accepts movement and returns its old Snapshot while Candidate Prepare is pending; prove the publication fence rejects Snapshot/Event/input only during durable commit-to-swap; prove the first observable post-swap Snapshot and Receipt reference the same new Package/WorldSession at Tick 0; prove the added house remains visible and ordinary catalog pages still do not install Edit API.

- [ ] **Step 2: Run focused Browser and Runtime gates**

```bash
pnpm exec vitest run apps/playground/src/worldkit-authoring-edit-add-house.browser.test.ts apps/playground/src/worldkit-authoring-edit-api.browser.test.ts apps/playground/src/worldkit-ready-reset.browser.test.ts packages/runtime-host/src/publication-v2.test.ts scripts/lib/authoring-edit-full-reload.integration.test.ts
```

- [ ] **Step 3: Run the real manual playtest**

Start only through:

```bash
pnpm worldkit run examples/authoring/basic-world.json
```

Open the printed trusted Authoring URL. Using real keyboard/mouse interaction: move and rotate the initial subject, perform add-house Dry Run then Apply through the Authoring/Edit surface, verify the old page remains interactive during Prepare, verify the new house appears after publication, move again in the new WorldSession, reset once, and verify only one canvas remains. Record exact observed Session IDs, Tick reset, visible house, controls, and any environment limitation. Do not use `pnpm dev + ?authoring=1`.

- [ ] **Step 4: Run final repository gates once on the final code tree**

```bash
pnpm exec tsx scripts/check-agent-self-check.ts
pnpm typecheck
pnpm verify:workspace-boundaries
pnpm test:census
pnpm test
pnpm build
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

Expected: all pass; Browser V5 exact 39; existing scene rendering remains valid.

- [ ] **Step 5: Perform the final invariant audit**

```bash
rg -n "rebaseRequired" packages apps scripts docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md
pnpm exec tsx scripts/check-test-census.ts
git diff --check
git diff --exit-code origin/main -- docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md
```

Also inspect `packages/authoring-host/package.json`, Browser API key census, strict equality/nullish checks in every touched production file, and leftover Host/session/temp directories.

- [ ] **Step 6: Update truth docs and commit**

Mark only the Full Reload production-closure evidence actually proven. Leave P16-I1 and P16-G2 open, leave the specification header unchanged, distinguish the in-page demo from the formal file-backed Host, and retain historical reviews as historical evidence.

```bash
git add apps/playground/src/worldkit-authoring-edit-add-house.browser.test.ts docs README.md
git commit -m "docs(p16): record full reload production closure"
```

### Task 7: Integrate the verified branch into `main`

**Files:**
- No source file changes expected after Task 6.

**Interfaces:**
- Consumes: exact verified feature tree and clean current `origin/main`.
- Produces: pushed `origin/main` whose tree is byte-identical to the verified feature tree.

- [ ] **Step 1: Fetch and audit divergence**

```bash
git fetch origin --prune
git status --short
git log --oneline --decorate origin/main..HEAD
git diff --check origin/main...HEAD
```

- [ ] **Step 2: Merge into current `main` without discarding unrelated work**

Use a clean integration checkout. If `main` moved, perform a semantic three-way integration and rerun only the gates invalidated by the new base. Do not force-push.

- [ ] **Step 3: Verify identical tree and push**

```bash
git rev-parse HEAD^{tree}
git rev-parse codex/p16-world-changeset-remaining^{tree}
git push origin main
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Expected: local `main` and `origin/main` point to the same commit; merge tree equals the fully verified feature tree.
