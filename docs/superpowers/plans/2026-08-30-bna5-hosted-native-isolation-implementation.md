# BNA-5 Hosted Native Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fail-closed Trusted Local/Hosted Isolated trust profiles, effective budgets, a provider-neutral isolation supervisor, a container hostile suite, and a dedicated-origin browser bridge without changing Babylon Native authoring or duplicating Runtime authority.

**Architecture:** The Trusted Host verifies the exact BNA-3 Package, resolves a locked Trust Profile, computes one field-by-field effective budget, and delegates the whole existing BNA-2/BNA-4 Runtime to a disposable isolation provider. RuntimeHost/Gameplay/Havok remain inside the active execution domain; the parent owns only lease, deadline, attestation and cleanup. Cross-domain traffic wraps existing Runtime Session Protocol V1 values and never carries Babylon handles.

**Tech Stack:** TypeScript 5.9, Vitest, Canonical JSON/SHA-256, existing RuntimeHost and Babylon/Havok 9.23.0/1.3.14, Docker/OCI reference runner, Playwright/Vite browser verification, lodash-es named imports.

**Spec:** `docs/superpowers/specs/2026-08-30-bna5-hosted-native-isolation-design.md`

## Global Constraints

- BNA-4 must be accepted on `main` before BNA-5 product code is merged; rebase/merge the accepted BNA-4 tree before Task 1.
- Add no Native-specific workspace package and no second checker, RuntimeHost, Gameplay Kernel, command language or geometry protocol.
- `nativeSceneProfileRef` remains structural; `nativeExecutionTrustProfileRef` is the only trust selector.
- Hosted Isolated has no in-process, `node:vm`, Worker-thread, same-user child-process or Trusted Local fallback.
- The whole verified Runtime executes inside the isolation domain; Babylon/Havok handles never cross it.
- Use one exact parser per public contract, `===`/`!==` for equality, lodash-es `isNil`/`isEmpty` for null/empty checks, and named imports only.
- Host diagnostics and receipts never contain absolute paths, environment values, credentials, raw logs, stack traces or provider handles.
- Every behavior change follows RED -> observed failure -> minimal GREEN -> focused regression. Do not run full repository gates between tasks.
- Each task produces one independently reviewable commit; generated artifacts required by that task are committed with their source.
- Final Cloud gate/review applies only to the exact pushed candidate SHA and does not replace the container/browser security evidence.

## File map

### Contract authority

- Create `packages/runtime-contracts/src/native-execution-isolation.ts`: exact types, parsers and hash helpers for Trust Profile, cap/effective budget, request/result/receipt, usage and transport envelope.
- Create `packages/runtime-contracts/src/native-execution-isolation.test.ts`: exact-key, union, unit, hash/tamper and protocol-envelope tests.
- Create `packages/runtime-contracts/src/native-execution-isolation-v1.schema.json`: JSON Schema for serialized Host/provider DTOs.
- Modify `packages/runtime-contracts/src/index.ts` and `packages/runtime-contracts/package.json`: one export path and Schema export.

### Host policy and lifecycle

- Create `packages/runtime-host/src/native-execution-budget.ts`: sole field-by-field cap resolver.
- Create `packages/runtime-host/src/native-execution-budget.test.ts`: asymmetric, overflow, missing and tenant-escalation tests.
- Create `packages/runtime-host/src/native-isolation-supervisor.ts`: provider interface, lifecycle, deadlines, attestation verification, bounded protocol and cleanup.
- Create `packages/runtime-host/src/native-isolation-supervisor.test.ts`: allocation cutoff, phase, timeout, cancellation, provider loss, quarantine, exact receipt tests.
- Modify `packages/runtime-host/src/index.ts`: export the one Host-facing isolation API.

### Enclave composition

- Create `packages/runtime-babylon/src/babylon-native-isolated-runtime-entry.ts`: exact verified-Package-to-existing-BNA-4 RuntimeHost composition and Runtime Session Protocol V1 dispatch inside the guest.
- Create `packages/runtime-babylon/src/babylon-native-isolated-runtime-entry.test.ts`: real Package identity, possession, Havok support, Runtime Session Protocol V1 and cleanup tests.
- Modify `packages/runtime-babylon/src/index.ts`: export only the enclave entry and its input/result types.

### Linux reference provider and hostile evidence

- Create `scripts/native-scene/hosted/container-provider.ts`: Docker CLI adapter behind `NativeIsolationProviderV1`.
- Create `scripts/native-scene/hosted/container-provider.test.ts`: command-policy, redaction and process-tree behavior tests with an injected command runner.
- Create `scripts/native-scene/hosted/runner-entry.ts`: guest JSON-lines entry using the runtime-babylon enclave entry.
- Create `scripts/native-scene/hosted/runner/Dockerfile`: digest-pinned non-root read-only runner image.
- Create `scripts/native-scene/hosted/hostile-fixtures/*.mjs`: exact network/env/fs/process/CPU/memory/output/protocol/cross-run attacks.
- Create `scripts/verification/verify-hosted-native-isolation.ts`: real container verifier and stable evidence summary.
- Modify root `package.json`: `verify:hosted-native-isolation` stable command.

### Dedicated browser origin

- Create `apps/native-scene-playground/src/hosted-runtime-bridge.ts`: exact origin/source/nonce/sequence MessagePort supervisor.
- Create `apps/native-scene-playground/src/hosted-runtime-bridge.test.ts`: protocol and lifecycle negatives.
- Create `apps/native-scene-playground/src/hosted-runtime-frame.ts`: guest bridge to the existing RuntimeHost path.
- Modify `apps/native-scene-playground/src/main.ts`, `vite.config.ts` and `style.css`: explicit hosted-isolated evidence mode without changing Trusted Local default.
- Create `scripts/verification/verify-hosted-native-browser.ts`: Playwright CSP/origin/storage/network/readiness verifier.
- Modify root `package.json`: `verify:hosted-native-browser` stable command.

### Clean break and truth

- Create `scripts/verification/verify-bna5-clean-break.ts`: forbidden alias/fallback/provider-leak census.
- Modify root `package.json`, `docs/18-refactor-progress-and-backlog.md`, the BNA long design and WRC status only after exact-SHA GO.
- Create `docs/reviews/2026-08-30-bna5-hosted-native-isolation-review.md`: exact evidence and disposition.

---

### Task 1: BNA5-10 — Exact isolation contracts

**Files:**
- Create: `packages/runtime-contracts/src/native-execution-isolation.ts`
- Create: `packages/runtime-contracts/src/native-execution-isolation.test.ts`
- Create: `packages/runtime-contracts/src/native-execution-isolation-v1.schema.json`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `packages/runtime-contracts/package.json`

**Interfaces:**
- Consumes: `Sha256HashV1`, `sha256CanonicalJson`, Registry-style `...Ref`/hash conventions and existing `RuntimeSessionRequestV1`/`RuntimeSessionReceiptV1`/`RuntimeSessionEventV1` values.
- Produces:

```ts
type NativeExecutionTrustModeV1 = "trusted-local" | "hosted-isolated";

interface NativeExecutionTrustProfileV1 {
  readonly kind: "native-execution-trust-profile";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly resourceRef: string;
  readonly contentHash: Sha256HashV1;
  readonly trustMode: NativeExecutionTrustModeV1;
  readonly requiredIsolationCapabilityIds: readonly string[];
}

interface NativeEffectiveExecutionBudgetV1 {
  readonly scene: {
    readonly maximumVertices: number;
    readonly maximumTriangles: number;
    readonly maximumColliders: number;
  };
  readonly assets: {
    readonly maximumAssetCount: number;
    readonly maximumAssetBytes: number;
    readonly maximumTextureCount: number;
    readonly maximumTextureBytes: number;
  };
  readonly runtime: {
    readonly maximumSceneNodeCount: number;
    readonly maximumMaterialCount: number;
    readonly maximumShaderCount: number;
    readonly maximumPhysicsBodyCount: number;
  };
  readonly process: {
    readonly maximumWallTimeMilliseconds: number;
    readonly maximumCpuTimeMilliseconds: number;
    readonly maximumMemoryBytes: number;
    readonly maximumProcessCount: number;
  };
  readonly protocol: {
    readonly maximumInboundMessageBytes: number;
    readonly maximumOutboundMessageBytes: number;
    readonly maximumReceiptBytes: number;
    readonly maximumDiagnosticCount: number;
    readonly maximumLogBytes: number;
  };
}

function parseNativeExecutionTrustProfileV1(input: unknown): NativeExecutionTrustProfileV1;
function parseNativeEffectiveExecutionBudgetV1(input: unknown): NativeEffectiveExecutionBudgetV1;
function parseNativeIsolatedExecutionRequestV1(input: unknown): NativeIsolatedExecutionRequestV1;
function parseNativeIsolatedExecutionResultV1(input: unknown): NativeIsolatedExecutionResultV1;
function parseNativeIsolatedExecutionReceiptV1(input: unknown): NativeIsolatedExecutionReceiptV1;
function parseNativeIsolationTransportEnvelopeV1(input: unknown): NativeIsolationTransportEnvelopeV1;
function hashNativeEffectiveExecutionBudgetV1(input: NativeEffectiveExecutionBudgetV1): Sha256HashV1;
function hashNativeIsolatedExecutionRequestV1(input: NativeIsolatedExecutionRequestV1): Sha256HashV1;
function hashNativeIsolatedExecutionResultV1(input: NativeIsolatedExecutionResultV1): Sha256HashV1;
function hashNativeIsolatedExecutionReceiptV1(input: NativeIsolatedExecutionReceiptV1): Sha256HashV1;
function verifyNativeIsolatedExecutionReceiptV1(input: {
  readonly request: NativeIsolatedExecutionRequestV1;
  readonly result: NativeIsolatedExecutionResultV1;
  readonly receipt: NativeIsolatedExecutionReceiptV1;
}): NativeIsolatedExecutionReceiptV1;
```

- [ ] **Step 1: Write exact-key and hash RED tests**

Add tests whose fixtures use deliberately asymmetric values so field swaps cannot pass:

```ts
it("parses and hashes one exact Hosted request", () => {
  const parsed = parseNativeIsolatedExecutionRequestV1(hostedRequestFixture());
  expect(parsed.nativeExecutionTrustProfileRef).toBe(
    "worldkit://native-execution-trust-profile/hosted-isolated@1",
  );
  expect(hashNativeIsolatedExecutionRequestV1(parsed)).toMatch(/^sha256:[0-9a-f]{64}$/);
});

it.each(["sandboxProfileRef", "trustProfileRef", "isTrusted"])(
  "rejects the non-canonical trust alias %s",
  (field) => expect(() => parseNativeIsolatedExecutionRequestV1({
    ...hostedRequestFixture(),
    nativeExecutionTrustProfileRef: undefined,
    [field]: "worldkit://native-execution-trust-profile/hosted-isolated@1",
  })).toThrow(/NativeIsolatedExecutionRequestV1/),
);

it("rejects a receipt whose request identity or effective budget hash drifts", () => {
  expect(() => verifyNativeIsolatedExecutionReceiptV1({
    request: hostedRequestFixture(),
    result: completedResultFixture(),
    receipt: {
      ...receiptFixture(),
      effectiveBudgetHash: `sha256:${"0".repeat(64)}`,
    },
  })).toThrow(/NativeIsolatedExecutionReceiptV1/);
});
```

- [ ] **Step 2: Run the contract test and observe RED**

Run: `pnpm exec vitest run packages/runtime-contracts/src/native-execution-isolation.test.ts`  
Expected: FAIL because the module and exported parsers do not exist.

- [ ] **Step 3: Implement exact types, parsers, unions and hashes**

Use `snapshotDataRecord`, `hasExactKeys`, explicit closed status/mode checks, positive-safe-integer
validation and `Object.freeze`. The receipt parser validates its closed shape; the receipt verifier
recomputes request, effective-budget and terminal-result hashes from the paired values and compares
every shared identity. Do not accept a caller assertion without rehashing. Model result/outcome as
discriminated unions, reject `ready` as a Receipt outcome, and do not preserve rejected field aliases.

- [ ] **Step 4: Add and validate the JSON Schema export**

The Schema must set `additionalProperties: false` at every object, use `oneOf` for operation/result
unions, use the exact public field names above, and carry integer minimum `1` for all caps. Export it
only as `./native-execution-isolation-schema`.

- [ ] **Step 5: Run focused GREEN and workspace-boundary checks**

Run:

```bash
pnpm exec vitest run packages/runtime-contracts/src/native-execution-isolation.test.ts
pnpm verify:workspace-boundaries
pnpm typecheck
git diff --check
```

Expected: all exit 0; no new package or undeclared import.

- [x] **Step 6: Commit**

```bash
git add packages/runtime-contracts
git commit -m "feat(bna5): define native isolation contracts"
```

### Task 2: BNA5-20 — Effective budget authority

**Files:**
- Create: `packages/runtime-host/src/native-execution-budget.ts`
- Create: `packages/runtime-host/src/native-execution-budget.test.ts`
- Modify: `packages/runtime-host/src/index.ts`

**Interfaces:**
- Consumes: parsed `NativeExecutionTrustProfileV1`, exact Package `resourceBudget`, Host hard cap and authenticated tenant cap.
- Produces:

```ts
interface ResolveNativeEffectiveExecutionBudgetInputV1 {
  readonly trustProfile: NativeExecutionTrustProfileV1;
  readonly sceneProfileBudget: WorldPackageResourceBudgetV1;
  readonly worldPackageResourceBudget: WorldPackageResourceBudgetV1;
  readonly hostHardCap: NativeEffectiveExecutionBudgetV1;
  readonly tenantCap: NativeEffectiveExecutionBudgetV1;
}

function resolveNativeEffectiveExecutionBudgetV1(
  input: ResolveNativeEffectiveExecutionBudgetInputV1,
): NativeEffectiveExecutionBudgetV1;
```

- [ ] **Step 1: Write asymmetric minimum and cutoff RED tests**

```ts
it("takes the field-by-field minimum and projects exact Package scene fields", () => {
  const actual = resolveNativeEffectiveExecutionBudgetV1(asymmetricBudgetInput());
  expect(actual.scene).toEqual({
    maximumVertices: 101,
    maximumTriangles: 202,
    maximumColliders: 3,
  });
  expect(actual.process.maximumMemoryBytes).toBe(4_194_304);
  expect(actual.protocol.maximumLogBytes).toBe(8192);
});

it("never allows tenant policy to raise a Host or Package limit", () => {
  const actual = resolveNativeEffectiveExecutionBudgetV1(tenantEscalationInput());
  expect(actual).toEqual(expectedHostBoundBudget());
});
```

Also cover missing groups, zero, negative, unsafe integer, extra keys and unknown Trust Profile.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run packages/runtime-host/src/native-execution-budget.test.ts`  
Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement one explicit resolver**

Use a fixed field table local to this domain; do not accept dynamic field iteration from caller data.
Project `maximumVertices`, `maximumTriangles`, `maximumColliders` from the Scene Profile and Package
into the matching scene fields, then take the minimum with Host and tenant. For the other groups,
take the Host/tenant minimum and require the Trust Profile's capability IDs to cover every enforced
group. Return a newly frozen budget and its canonical hash. Throw a stable Host policy error before
any provider API is called.

- [ ] **Step 4: Run GREEN and affected Host tests**

Run:

```bash
pnpm exec vitest run packages/runtime-host/src/native-execution-budget.test.ts packages/runtime-host/src/runtime-host-lifecycle.test.ts
pnpm typecheck
git diff --check
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime-host
git commit -m "feat(bna5): resolve effective native execution budgets"
```

### Task 3: BNA5-30 — Isolation supervisor and attestation

**Files:**
- Create: `packages/runtime-host/src/native-isolation-supervisor.ts`
- Create: `packages/runtime-host/src/native-isolation-supervisor.test.ts`
- Modify: `packages/runtime-host/src/index.ts`

**Interfaces:**
- Consumes: exact request, resolved budget, `NativeIsolationProviderV1`, `NativeIsolationAttestationVerifierV1`.
- Produces:

```ts
interface NativeIsolationAttestationVerifierV1 {
  verify(input: {
    readonly receipt: NativeIsolatedExecutionReceiptV1;
    readonly attestationBytes: Uint8Array;
  }): Promise<{ readonly status: "verified" } | {
    readonly status: "rejected";
    readonly diagnosticCode: string;
  }>;
}

interface NativeIsolationProviderV1 {
  readonly runnerIdentityRef: string;
  prepare(
    request: NativeIsolatedExecutionRequestV1,
    cancellationSignal: AbortSignal,
  ): Promise<PreparedNativeIsolationV1>;
}

interface PreparedNativeIsolationV1 {
  start(): Promise<NativeIsolatedExecutionResultV1>;
  submit(envelope: NativeIsolationTransportEnvelopeV1):
    Promise<NativeIsolationTransportEnvelopeV1>;
  terminate(reason: NativeIsolationTerminationReasonV1):
    Promise<NativeIsolatedExecutionResultV1>;
  collectReceipt(): Promise<{
    readonly result: NativeIsolatedExecutionResultV1;
    readonly receipt: NativeIsolatedExecutionReceiptV1;
    readonly attestationBytes: Uint8Array;
  }>;
  dispose(): Promise<void>;
}

class NativeIsolationSupervisorV1 {
  static create(input: unknown): NativeIsolationSupervisorV1;
  start(): Promise<NativeIsolatedExecutionResultV1>;
  submit(envelope: unknown): Promise<NativeIsolationTransportEnvelopeV1>;
  terminate(reason: NativeIsolationTerminationReasonV1): Promise<void>;
  dispose(): Promise<void>;
}
```

- [ ] **Step 1: Write lifecycle and no-allocation RED tests**

Cover exact phases and order with a deterministic fake provider:

```ts
it("does not allocate a provider for a malformed request or cap", async () => {
  const provider = fakeIsolationProvider();
  expect(() => NativeIsolationSupervisorV1.create({
    ...validSupervisorInput(),
    request: { ...hostedRequestFixture(), trustProfileRef: "legacy" },
  })).toThrow(/NativeIsolatedExecutionRequestV1/);
  expect(provider.prepare).not.toHaveBeenCalled();
});

it("times out, kills, collects a control-plane receipt, and disposes exactly once", async () => {
  const provider = deferredIsolationProvider();
  const supervisor = NativeIsolationSupervisorV1.create(validSupervisorInput(provider));
  const started = supervisor.start();
  provider.clock.advanceBy(validBudget().process.maximumWallTimeMilliseconds + 1);
  await expect(started).resolves.toMatchObject({ status: "terminated", reason: "timeout" });
  expect(provider.prepared.terminate).toHaveBeenCalledOnce();
  expect(provider.prepared.collectReceipt).toHaveBeenCalledOnce();
  await supervisor.dispose();
  expect(provider.prepared.dispose).toHaveBeenCalledOnce();
});
```

Also cover cancellation before ready, provider loss after ready, attestation mismatch, receipt request
hash mismatch, cleanup quarantine, duplicate `start`, idempotent `terminate`/`dispose`, wrong
nonce/sequence, oversize inbound/outbound messages and submit after termination.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run packages/runtime-host/src/native-isolation-supervisor.test.ts`  
Expected: FAIL because the supervisor does not exist.

- [ ] **Step 3: Implement the explicit state machine**

Keep supervisor state private and provider-neutral. Use one injected monotonic clock/deadline source
for tests. Every `start` path must enter one `finally` cleanup path. Preserve the first stable failure,
still attempt termination, receipt collection, attestation verification and disposal, and map cleanup
failure to `cleanup-failed`/quarantine without exposing provider errors.

The supervisor may retain only lifecycle phase, exact request/hash, sequence counters, deadline,
provider lease and terminal receipt. It must not retain Gameplay state, rewrite protocol payloads or
infer Camera/ground support.

- [ ] **Step 4: Run GREEN and RuntimeHost regressions**

Run:

```bash
pnpm exec vitest run packages/runtime-host/src/native-isolation-supervisor.test.ts packages/runtime-host/src/runtime-host-lifecycle.test.ts packages/runtime-host/src/publication-v2.test.ts
pnpm typecheck
git diff --check
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime-host
git commit -m "feat(bna5): supervise isolated native runtimes"
```

### Task 4: BNA5-40 — Existing BNA-2/BNA-4 Runtime inside the enclave

**Files:**
- Create: `packages/runtime-babylon/src/babylon-native-isolated-runtime-entry.ts`
- Create: `packages/runtime-babylon/src/babylon-native-isolated-runtime-entry.test.ts`
- Modify: `packages/runtime-babylon/src/index.ts`

**Interfaces:**
- Consumes: verified exact Native WorldPackage, exact Host-owned Module loader, effective budget, runtime identity/bootstrap inputs and existing Runtime Session Protocol V1 values.
- Produces:

```ts
interface BabylonNativeIsolatedRuntimeEntryV1 {
  readonly runtimeSessionId: string;
  initialSnapshot(): WorldRuntimeSnapshotV4;
  submit(payload: RuntimeSessionRequestV1):
    Promise<RuntimeSessionReceiptV1>;
  dispose(): Promise<void>;
}

function createBabylonNativeIsolatedRuntimeEntryV1(
  input: CreateBabylonNativeIsolatedRuntimeEntryInputV1,
): Promise<BabylonNativeIsolatedRuntimeEntryV1>;
```

- [ ] **Step 1: Write exact-package Runtime RED tests**

Use the existing Cloud Ridge verified Package fixture and real Havok WASM:

```ts
it("publishes one initially possessed RuntimeHost session inside the enclave", async () => {
  const entry = await createBabylonNativeIsolatedRuntimeEntryV1(validEntryInput());
  expect(entry.initialSnapshot()).toMatchObject({
    runtimeSessionId: "runtime.hosted.cloud-ridge",
    runtime: { phase: "ready" },
  });
  expect(Object.values(
    entry.initialSnapshot().world.gameplayInspection.relationshipStatesById,
  )).toEqual([expect.objectContaining({ controlledEntityId: "g-bot-primary" })]);
  await entry.dispose();
});

it("rejects a package or effective-budget drift before Havok/Subject/Camera", async () => {
  const probes = allocationProbe();
  await expect(createBabylonNativeIsolatedRuntimeEntryV1(
    driftedEntryInput(probes),
  )).rejects.toThrow(/WORLDKIT_NATIVE_ISOLATION_IDENTITY_MISMATCH/);
  expect(probes.calls).toEqual([]);
});
```

Also exercise one fixed-input request, real support contact, session close, wrong session/Protocol V1 payload,
two-instance isolation, partial create and throwing dispose.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run packages/runtime-babylon/src/babylon-native-isolated-runtime-entry.test.ts`  
Expected: FAIL because the entry does not exist.

- [ ] **Step 3: Compose, do not duplicate, the existing path**

Call `prepareBabylonNativeRuntimePackageV1`, the existing BNA-4 Adapter factory and `RuntimeHost.create`
with initial control binding. Route parsed Runtime Session Protocol V1 requests into the same RuntimeHost methods already used
by the Browser/CLI runtime. Do not invoke `module.build()` directly, inspect visual Meshes for physics,
or add enclave-specific reset/Camera/action methods.

- [ ] **Step 4: Run GREEN and Native Runtime regressions**

Run:

```bash
pnpm exec vitest run packages/runtime-babylon/src/babylon-native-isolated-runtime-entry.test.ts packages/runtime-babylon/src/babylon-native-package-runtime.test.ts packages/runtime-babylon/src/babylon-native-surface-admission.test.ts packages/runtime-babylon/src/babylon-character-body-port.conformance.test.ts
pnpm typecheck
git diff --check
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime-babylon
git commit -m "feat(bna5): run verified native worlds inside an enclave"
```

### Task 5: BNA5-50 — Linux container provider and hostile suite

**Files:**
- Create: `scripts/native-scene/hosted/container-provider.ts`
- Create: `scripts/native-scene/hosted/container-provider.test.ts`
- Create: `scripts/native-scene/hosted/runner-entry.ts`
- Create: `scripts/native-scene/hosted/runner/Dockerfile`
- Create: `scripts/native-scene/hosted/hostile-fixtures/network.mjs`
- Create: `scripts/native-scene/hosted/hostile-fixtures/environment.mjs`
- Create: `scripts/native-scene/hosted/hostile-fixtures/filesystem.mjs`
- Create: `scripts/native-scene/hosted/hostile-fixtures/process.mjs`
- Create: `scripts/native-scene/hosted/hostile-fixtures/cpu.mjs`
- Create: `scripts/native-scene/hosted/hostile-fixtures/memory.mjs`
- Create: `scripts/native-scene/hosted/hostile-fixtures/output.mjs`
- Create: `scripts/native-scene/hosted/hostile-fixtures/protocol.mjs`
- Create: `scripts/verification/verify-hosted-native-isolation.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `NativeIsolationProviderV1`, exact request/package mount, injected bounded command runner.
- Produces: `createDockerNativeIsolationProviderV1(options)` and root command `pnpm verify:hosted-native-isolation`.

- [ ] **Step 1: Write Docker command-policy RED tests**

Assert the command is built from trusted options, never guest strings, and includes all controls:

```ts
expect(invocation.args).toEqual(expect.arrayContaining([
  "run", "--rm", "--network", "none", "--read-only",
  "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
  "--pids-limit", String(budget.process.maximumProcessCount),
  "--memory", String(budget.process.maximumMemoryBytes),
]));
expect(invocation.env).toEqual({ LC_ALL: "C", LANG: "C" });
expect(invocation.args.join(" ")).not.toContain(packageHostPath);
```

Also assert a digest-only image ref, exact read-only Package mount, request-owned tmpfs, no daemon
socket/host path/device/privileged flag, bounded stdout/stderr, timeout kill and redacted diagnostics.

- [ ] **Step 2: Run provider RED**

Run: `pnpm exec vitest run scripts/native-scene/hosted/container-provider.test.ts`  
Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement the provider and guest entry**

Use `spawn` with argument arrays and an injected runner; never use shell interpolation. Resolve and
validate explicit absolute package/temp paths before constructing mounts. The guest reads one exact
request from stdin, independently re-verifies mounted Package bytes, creates the Task 4 entry and
emits only bounded JSON-lines envelopes. The control plane, not the guest, adds actual usage,
cleanup and attestation fields.

- [ ] **Step 4: Build the digest-pinned non-root runner image**

The Dockerfile must use a pinned base digest, create a fixed non-root UID/GID, copy only the bundled
runner/runtime dependencies, set a read-only-compatible working directory and declare no network or
secret. The verifier records the built image digest and refuses a tag-only image.

- [ ] **Step 5: Implement hostile fixtures and real verifier**

Each fixture attempts exactly one threat and reports only a fixed marker if unexpectedly successful.
The verifier runs the fixture under the same provider policy, confirms the expected stable result,
then checks `docker ps`/inspect evidence for no retained container/mount and a clean Host canary. It
also runs two simultaneous tenant canaries and one sequential reuse canary.

- [ ] **Step 6: Run focused GREEN and real container evidence**

Run:

```bash
pnpm exec vitest run scripts/native-scene/hosted/container-provider.test.ts
pnpm verify:hosted-native-isolation
pnpm typecheck
git diff --check
```

Expected: all exit 0. The verifier summary records image digest, rootless/user namespace state,
policy hash, every hostile case, cleanup census and exact Package root without secrets or paths.

- [ ] **Step 7: Commit**

```bash
git add scripts/native-scene/hosted scripts/verification/verify-hosted-native-isolation.ts package.json
git commit -m "feat(bna5): verify hosted native container isolation"
```

### Task 5.5: BNA5-55 — Precompiled Browser-safe Runtime validator

**Files:**
- Create: `scripts/contracts/build-runtime-contract-validators.ts`
- Create: `packages/runtime-contracts/src/world-runtime-bootstrap-validator.generated.mjs`
- Create: `packages/runtime-contracts/src/world-runtime-bootstrap-validator.generated.d.mts`
- Modify: `packages/runtime-contracts/src/world-runtime-bootstrap.ts`
- Create: `packages/world-package/src/native-runtime-directory.ts`
- Create: `packages/world-package/src/runtime-contract.ts`
- Modify: `packages/world-package/package.json`
- Modify: Runtime-only consumers of the mixed WorldPackage root entry
- Modify: root `package.json`

**Reason:** The first strict-CSP Browser RED proved that the current runtime path calls AJV's
dynamic compiler and therefore requires forbidden `unsafe-eval`. The security boundary stays
authoritative; the validator must move to a deterministic build-time artifact rather than weakening
the dedicated runtime origin.

- [x] Generate the AJV standalone ESM validator from the one authoritative JSON Schema.
- [x] Add `--write` and default check modes with byte-exact stale-artifact failure.
- [x] Keep parser behavior and error details byte-equivalent under the existing contract tests.
- [x] Split the Native Runtime WorldPackage verifier from the Canonical compiler/Authoring entry so
  the Native production bundle cannot load the compiler as a shadow dependency.
- [x] Prove the production Browser bundle runs without AJV compiler/new-Function code under the
  strict CSP verifier.

This task is `main-agent-only` because it changes a shared Runtime contract publication boundary.
It blocks Task 6 Browser acceptance but does not change Schema or accept a compatibility path.

### Task 6: BNA5-60 — Dedicated-origin browser bridge

**Files:**
- Create: `apps/native-scene-playground/src/hosted-runtime-bridge.ts`
- Create: `apps/native-scene-playground/src/hosted-runtime-bridge.test.ts`
- Create: `apps/native-scene-playground/src/hosted-runtime-frame.ts`
- Modify: `apps/native-scene-playground/src/main.ts`
- Modify: `apps/native-scene-playground/vite.config.ts`
- Modify: `apps/native-scene-playground/src/style.css`
- Create: `scripts/verification/verify-hosted-native-browser.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing Runtime Session Protocol V1 values, exact runtime origin, runtimeSessionId, nonce and protocol budget.
- Produces:

```ts
function createHostedRuntimeBridgeV1(input: {
  readonly frame: HTMLIFrameElement;
  readonly runtimeOrigin: string;
  readonly runtimeSessionId: string;
  readonly sessionNonce: string;
  readonly protocolBudget: NativeEffectiveExecutionBudgetV1["protocol"];
}): HostedRuntimeBridgeV1;
```

- [x] **Step 1: Write origin/source/nonce/sequence RED tests**

```ts
it.each(["wrong-origin", "wrong-source", "wrong-nonce", "reused-sequence"])(
  "terminates on %s",
  async (attack) => {
    const harness = bridgeHarness();
    harness.deliver(attackEnvelope(attack));
    expect(harness.bridge.phase).toBe("terminated");
    expect(harness.frame.remove).toHaveBeenCalledOnce();
  },
);
```

Cover exact target origin, MessagePort transfer, additional keys, oversized messages, wrong phase,
navigation/removal, duplicate ready and submit after dispose.

- [x] **Step 2: Run bridge RED**

Run: `pnpm exec vitest run apps/native-scene-playground/src/hosted-runtime-bridge.test.ts`  
Expected: FAIL because the bridge does not exist.

- [x] **Step 3: Implement the shell and frame bridge**

The shell creates a cross-origin frame, uses exact `targetOrigin`, validates `event.origin` and
`event.source`, transfers one MessagePort, then removes the window message listener. The guest uses
the Task 4 entry and exact Runtime Session Protocol V1 parsers. Physical keyboard/pointer input stays
inside the frame and enters the existing SDK input layer. Do not use `srcdoc`, `*`, parent DOM access, local storage,
fetch fallback or a Hosted-specific command payload.

- [x] **Step 4: Add strict headers and browser verifier**

The shell uses exactly `sandbox="allow-scripts allow-same-origin"` on a cross-origin frame; it never
uses those tokens for a same-origin parent. The evidence server serves the runtime frame from a
different credentialless origin with no cookies and strict CSP/Permissions-Policy. CSP allows only
the exact immutable same-runtime-origin assets required by the verified Package and denies external
network destinations. Playwright attempts parent DOM/storage/external-network/top-navigation access,
wrong message identities and a normal movement/session-close flow. It must inspect Browser console/page errors and
verify frame removal/disposal after termination.

- [x] **Step 5: Run focused GREEN and Browser evidence**

Run:

```bash
pnpm exec vitest run apps/native-scene-playground/src/hosted-runtime-bridge.test.ts apps/native-scene-playground/src/native-runtime-host-module-loader.test.ts
pnpm build:native-scene
pnpm verify:hosted-native-browser
pnpm typecheck
git diff --check
```

Expected: all exit 0; Browser report distinguishes origin policy from container security.

- [ ] **Step 6: Commit**

```bash
git add apps/native-scene-playground scripts/verification/verify-hosted-native-browser.ts package.json
git commit -m "feat(bna5): isolate hosted native browser sessions"
```

### Task 7: BNA5-70 — Clean break and focused integration

**Files:**
- Create: `scripts/verification/verify-bna5-clean-break.ts`
- Create: `scripts/verification/verify-bna5-clean-break.test.ts`
- Modify: `package.json`
- Modify: only consumers that still expose a conflicting Hosted shortcut discovered by the census

**Interfaces:**
- Consumes: final Task 1-6 public names and file ownership.
- Produces: root command `pnpm verify:bna5-clean-break` with stable JSON `{ ok, scannedFileCount, checks }`.

- [x] **Step 1: Write census RED tests**

The verifier must fail on fixtures containing:

```text
sandboxProfileRef
trustProfileRef
isTrusted
hostedNativeFallback
node:vm
vm.runInContext
allowHostedInProcess
allow-same-origin on the application origin
postMessage(..., "*")
```

It must also verify no public Authoring/WorldPackage Schema contains Docker, Kubernetes, container,
iframe, origin or provider fields, and no Hosted bridge defines duplicate Gameplay/Camera command
names.

- [x] **Step 2: Run RED**

Run: `pnpm exec vitest run scripts/verification/verify-bna5-clean-break.test.ts`  
Expected: FAIL until the verifier exists and injected forbidden fixtures are detected.

- [x] **Step 3: Implement the verifier and delete actual conflicts**

Use a stable explicit file census with allowlisted documentation mentions. Delete, do not deprecate
or alias, any actual experimental conflicting path. Do not flag the official design discussion or
the isolated reference provider's required implementation strings.

- [ ] **Step 4: Run the affected integration set once**

Run:

```bash
pnpm verify:bna5-clean-break
pnpm verify:bna2-clean-break
pnpm native:cloud-ridge:package:check
pnpm verify:native-scene-playground
pnpm verify:hosted-native-isolation
pnpm verify:hosted-native-browser
pnpm verify:workspace-boundaries
pnpm typecheck
pnpm build
pnpm build:native-scene
git diff --check
```

Expected: all exit 0. Do not run root `pnpm test` locally here; exact-SHA Cloud runs it in Task 8.

- [ ] **Step 5: Commit and push the product candidate**

```bash
git add scripts/verification package.json
git commit -m "chore(bna5): enforce hosted isolation clean break"
git push -u origin codex/bna5-hosted-isolation
git rev-parse HEAD
git rev-parse @{upstream}
git status --porcelain
```

Expected: exact local/upstream SHA equality and empty status.

### Task 8: BNA5-90 — Exact-SHA review, truth update and merge

**Files:**
- Create: `docs/reviews/2026-08-30-bna5-hosted-native-isolation-review.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`
- Modify: `docs/superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md`

**Interfaces:**
- Consumes: exact pushed product SHA, Task 7 evidence, container runner capabilities and Browser report.
- Produces: scoped BNA-5 GO/NO-GO, PR, accepted `main` ancestry and truthful BNA-6/BWB-5 unblock.

- [ ] **Step 1: Freeze exact candidate identity**

Run:

```bash
git rev-parse HEAD
git rev-parse @{upstream}
git status --porcelain
```

Expected: equal full 40-character SHAs and empty status. Record image digest, Package root, policy
hash and evidence output hashes without credentials or local paths.

- [ ] **Step 2: Dispatch separate Cursor Cloud agents**

Use `reviewing-with-cursor` with model `grok-4.6`, `effort=xhigh`, `fast=true`:

- Agent A: read-only exact-SHA full gates: self-check, typecheck, studio/independent/root tests,
  builds, workspace, BNA1/BNA2/BNA5 clean breaks, Package check, Native/Hosted Browser verifiers and
  diff/status. It may report container evidence only if its runner exposes and records all required
  controls.
- Agent B: read-only exact-SHA Mode B + security + runtime-deep review. It must inspect installed
  Node/Babylon/Havok/platform semantics, threat matrix, authority, protocol, lifecycle, cleanup,
  diagnostics and current-only deletion.

Any product edit invalidates both conclusions and requires new exact-SHA runs.

- [ ] **Step 3: Adjudicate every finding**

For each P0/P1/P2, reproduce with a behavior RED before editing. Fix only confirmed defects, rerun
the focused test and affected gate, commit/push, then dispatch fresh exact-SHA agents. Do not accept a
GO with an open P2 because BNA-5 is a security boundary.

- [ ] **Step 4: Write the final review and update status truth**

The review records:

- exact base/head/product/docs SHAs;
- Trust Profile and authority map;
- container controls and hostile matrix;
- Browser origin/CSP/protocol evidence;
- Package/Havok/possession/lifecycle evidence;
- command/exit/output hashes;
- Cloud Agent IDs/Run IDs and verdicts;
- D1-D6 plus runtime-deep coverage; and
- explicit non-claims for BNA-6/BNA-7/BNA-8 and production vendor deployment.

Mark BNA-5 complete only after the exact product candidate is GO. BNA-6 and BWB-5 become unblocked,
not completed.

- [ ] **Step 5: Commit docs, open/merge PR and verify ancestry**

```bash
git add docs
git commit -m "docs(bna5): record hosted isolation acceptance"
git push
gh pr create --base main --head codex/bna5-hosted-isolation --title "BNA-5: isolate hosted native runtimes" --body-file /tmp/bna5-pr-body.md
gh pr merge --merge --delete-branch
git fetch origin main
git merge-base --is-ancestor <product-sha> origin/main
git merge-base --is-ancestor <docs-sha> origin/main
```

Expected: both ancestry commands exit 0. If required GitHub checks are queued but the exact candidate
already has valid Cloud gates, follow repository branch protection rather than waiting indefinitely;
never bypass a required failing check.

## Plan self-review matrix

| Spec requirement | Implemented by |
|---|---|
| two exact Trust Profiles, one name | Task 1 |
| field-by-field effective budget | Task 2 |
| lifecycle, timeout, attestation, cleanup | Task 3 |
| whole existing Runtime inside enclave | Task 4 |
| OS/container hostile boundary | Task 5 |
| dedicated browser origin and exact protocol | Task 6 |
| no fallback/alias/second dialect | Task 7 |
| exact-SHA security/full-dimension disposition | Task 8 |
| no Native-specific package | File map + Tasks 1-7 |
| BNA-6/BWB-5 unblock without overclaim | Task 8 |

Execution order is strict through Task 4. Tasks 5 and 6 become parallel-safe only after Task 4's
interfaces are committed and frozen. Task 7 and Task 8 are main-agent-only integration work.
