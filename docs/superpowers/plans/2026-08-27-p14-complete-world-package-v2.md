# P1.4 Complete WorldPackage V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is intentionally main-agent-only because it freezes a cross-package public version, migration boundary, Package Root domain, and trusted loading order.

**Goal:** Replace the minimum in-memory WorldPackage V1 build receipt as the active publication format with a complete, independently verifiable WorldPackage V2 directory that binds canonical world files, the full Registry Lock, legal metadata, Host compatibility, and optional publisher signatures without weakening or silently changing V1.

**Architecture:** Preserve `WorldPackageManifestV1` and `WorldPackageBuildReceiptV1` only as the explicit migration source. Add a closed V2 contract and provider-neutral byte-directory assembler/verifier in `@whitebox-world/world-package`; keep filesystem durability and Ed25519 key handling in `scripts/lib`. Runtime and P1.6 consumers move to V2 only after the verifier can reconstruct and validate the entire runtime configuration from package bytes.

**Tech Stack:** TypeScript, Vitest, pnpm workspace, Canonical JSON JCS V1, SHA-256, `jsonc-parser`, Node ESM filesystem and `node:crypto` composition adapters.

**Spec:** `docs/18-refactor-progress-and-backlog.md` P1.4; `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md` §16.1–16.3, §19.1, §20; `docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md` §6, §14, §21–§22.

## Global Constraints

- `WorldPackageManifestV1` and `WorldPackageBuildReceiptV1` remain byte-stable migration inputs; complete publication uses explicit V2 types and never silently changes V1 semantics.
- `integrity.json` lists every package file except itself and `signatures/`; signature files never enter Package Root.
- Package Root is exactly `SHA-256(canonical-json-jcs@1({ packageFormatVersion, canonicalizationProfile, hashAlgorithm, files }))` with path-sorted integrity entries.
- Signature input is the exact `worldkit-package-signature-envelope` V1 object frozen in the overall design; no string concatenation and no separately trusted digest field.
- `authoring-spec.json` remains optional and may be provenance-redacted; Runtime loads only locked runtime files and never reads mutable Registry or Authoring sources.
- A `redistributable` package rejects `internal-only` and `prohibited` resources. An `internal-only` package still rejects `prohibited` resources.
- Host validation order is path safety, exact file inventory, per-file bytes/hash, Package Root, Manifest/closure, signature policy, Host compatibility, then Runtime configuration construction.
- Provider-neutral packages do not import `node:*`; filesystem, permission, fsync, symlink, and Ed25519 operations stay in `scripts/lib`.
- All new public records reject unknown keys, accessors, symbol keys, negative zero, duplicate JSON keys, unsafe paths, non-canonical order, and all-zero hashes.
- Use `===`/`!==`; use `lodash-es` `isNil`/`isEmpty` for nullish and emptiness checks.
- Browser Protocol V5 remains exact 39 keys. No WorldPackage or Runtime Session method is added to `window.__WORLDKIT__`.
- `authoring-host` must not depend on `runtime-host`; composition adapters own the connection.
- The P1.6 design header remains `Detailed design; implementation not started` until the final P1.6 completion audit.

---

## File and ownership map

- `packages/world-package/src/v2-types.ts`: V2 public DTOs only.
- `packages/world-package/src/v2-contract.ts`: closed parsers, canonicalizers, hashes, migration report, compatibility and signature-envelope admission.
- `packages/world-package/src/v2-directory.ts`: provider-neutral byte inventory assembly and independent verification.
- `packages/world-package/src/v2-build.ts`: trusted build from Authoring/IR/Layout/Plan/Bootstrap/Registry legal closure.
- `packages/world-package/src/index.ts`: exact V2 exports; V1 exports stay named V1 and are not aliases.
- `scripts/lib/file-world-package.ts`: atomic directory publication and symlink-safe read adapter.
- `scripts/lib/world-package-signing.ts`: Node Ed25519 signing/trust adapter.
- `scripts/lib/world-package-resource-resolver.ts`: joins exact Registry provenance and legal document bindings to resolved asset bytes.
- `packages/runtime-host/src/runtime-host.ts`: consumer migration only; it receives verified V2 configuration and never reads a directory.
- `packages/authoring-host/src/build.ts`: Candidate migration only; it invokes the package store port and never imports filesystem code.

## Task 1: Freeze the V2 public contract and V1 migration boundary (`P14-PKG-01`)

**Depends on:** minimum `WorldPackageManifestV1` / `WorldPackageBuildReceiptV1`.

**Blocks:** every remaining task in this plan.

**Mode:** `main-agent-only`.

**Files:**

- Create: `packages/world-package/src/v2-types.ts`
- Create: `packages/world-package/src/v2-contract.ts`
- Create: `packages/world-package/src/v2-contract.test.ts`
- Modify: `packages/world-package/src/index.ts`
- Modify: `packages/world-package/package.json`

**Interfaces:**

- Consumes: `WorldPackageBuildReceiptV1`, `ExecutionResourceLockEntryV1`, Canonical JSON primitives.
- Produces:

```ts
export type WorldPackageDistributionPolicyV2 =
  | "internal-only"
  | "redistributable";

export interface WorldPackageLegalDocumentV2 {
  readonly id: string;
  readonly spdxLicenseExpression: string;
  readonly path: `LICENSES/${string}`;
  readonly mediaType: "text/plain; charset=utf-8";
  readonly sizeBytes: number;
  readonly contentHash: WorldPackageSha256HashV1;
}

export interface WorldPackageResourceArtifactV2 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: WorldPackageSha256HashV1;
  readonly licenseDocumentId: string;
  readonly redistributionPolicy: "allowed" | "internal-only" | "prohibited";
  readonly sourceUri?: string;
  readonly author?: string;
}

export interface WorldPackageHostCompatibilityV2 {
  readonly profileRef: string;
  readonly profileHash: WorldPackageSha256HashV1;
  readonly runtimeContractVersion: 1;
  readonly requiredFeatureIds: readonly string[];
}

export interface WorldPackageManifestV2 {
  readonly kind: "worldkit-world-package-manifest";
  readonly schemaVersion: 2;
  readonly id: string;
  readonly title: string;
  readonly packageFormatVersion: 2;
  readonly sdkVersion: string;
  readonly worldId: string;
  readonly seed: number;
  readonly runtimeTarget: "babylon-web";
  readonly canonicalizationProfile: "canonical-json-jcs@1";
  readonly hashAlgorithm: "sha256";
  readonly authoringSchema: Readonly<{
    readonly schemaVersion: 4;
    readonly contentHash: WorldPackageSha256HashV1;
  }>;
  readonly aiSchemaProjectionProfile: Readonly<{
    readonly resourceRef: string;
    readonly contentHash: WorldPackageSha256HashV1;
  }>;
  readonly normalizedWorldIrSchemaVersion: 4;
  readonly executionPlanSchemaVersion: 5;
  readonly authoringSpecHash: WorldPackageSha256HashV1;
  readonly normalizedWorldIrHash: WorldPackageSha256HashV1;
  readonly executionPlanHash: WorldPackageSha256HashV1;
  readonly registryLockHash: WorldPackageSha256HashV1;
  readonly layoutSolveReportHash: WorldPackageSha256HashV1;
  readonly initialControlledEntityId: string;
  readonly worldBounds: Readonly<{
    readonly centerMetersXZ: readonly [number, number];
    readonly sizeMetersXZ: readonly [number, number];
    readonly heightRangeMeters: readonly [number, number];
  }>;
  readonly resourceBudget: Readonly<{
    readonly maximumVertices: number;
    readonly maximumTriangles: number;
    readonly maximumColliders: number;
  }>;
  readonly lockedResources: readonly ExecutionResourceLockEntryV1[];
  readonly entryPoint: Readonly<{
    readonly executionPlanPath: "targets/babylon-web/execution-plan.json";
    readonly gameplayBootstrapPath: "gameplay/bootstrap.json";
  }>;
  readonly legal: Readonly<{
    readonly distributionPolicy: WorldPackageDistributionPolicyV2;
    readonly noticePath: "NOTICE";
    readonly licenseDocuments: readonly WorldPackageLegalDocumentV2[];
  }>;
  readonly hostCompatibility: WorldPackageHostCompatibilityV2;
  readonly resources: readonly WorldPackageResourceArtifactV2[];
}

export interface WorldPackageBuildReceiptV2 {
  readonly kind: "worldkit-world-package-build-receipt";
  readonly schemaVersion: 2;
  readonly manifest: WorldPackageManifestV2;
  readonly manifestHash: WorldPackageSha256HashV1;
  readonly fileIntegrityEntries: readonly WorldPackageFileIntegrityEntryV1[];
  readonly worldPackageRootHash: WorldPackageSha256HashV1;
}

export interface WorldPackageMigrationReportV1 {
  readonly kind: "worldkit-world-package-migration-report";
  readonly schemaVersion: 1;
  readonly sourceManifestSchemaVersion: 1;
  readonly targetManifestSchemaVersion: 2;
  readonly sourceWorldPackageRootHash: WorldPackageSha256HashV1;
  readonly targetWorldPackageRootHash: WorldPackageSha256HashV1;
  readonly sourceManifestHash: WorldPackageSha256HashV1;
  readonly targetManifestHash: WorldPackageSha256HashV1;
  readonly migratedFieldIds: readonly string[];
}
```

- [ ] **Step 1: Write RED exact-key and version tests**

Add tests that admit one fully populated V2 value and reject missing/unknown fields, V1-as-V2, V2-as-V1, aliases (`resourceLockHash`, `maxVertices`, `runtimeBackend`), unsorted/duplicate locked resources, unsafe legal paths, negative zero, symbol/accessor keys, and zero hashes.

- [ ] **Step 2: Run the contract test and capture RED**

Run: `pnpm exec vitest run packages/world-package/src/v2-contract.test.ts`

Expected: FAIL because V2 exports do not exist.

- [ ] **Step 3: Implement closed V2 canonicalizers and hashes**

Implement these exact exports:

```ts
canonicalWorldPackageManifestV2(value: unknown): WorldPackageManifestV2
hashWorldPackageManifestV2(value: unknown): WorldPackageSha256HashV1
assertWorldPackageBuildReceiptV2(value: unknown): WorldPackageBuildReceiptV2
canonicalWorldPackageSignatureEnvelopeV1(value: unknown): WorldPackageSignatureEnvelopeV1
worldPackageSignatureEnvelopeBytesV1(value: unknown): Uint8Array
assertWorldPackageMigrationReportV1(value: unknown): WorldPackageMigrationReportV1
```

V2 Root hashing must use `packageFormatVersion: 2`; do not reuse `hashWorldPackageRootV1` under a misleading name. Add `hashWorldPackageRootV2()` with the same domain fields and the new format version.

- [ ] **Step 4: Implement explicit migration input validation**

`migrateWorldPackageBuildReceiptV1ToV2()` must require all V2-only facts as an explicit `WorldPackageV1ToV2MigrationContextV1`; it must never invent title, SDK version, legal documents, AI Schema profile identity, Host profile, or resource provenance. It returns `{ receipt, report }` and the report hashes both sides.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run packages/world-package/src/manifest.test.ts packages/world-package/src/build-receipt.test.ts packages/world-package/src/v2-contract.test.ts
pnpm typecheck
```

Expected: V1 bytes remain green; V2 tests pass; consumer compile failures are limited to no files because active consumers still use explicitly named V1.

- [ ] **Step 6: Commit**

```bash
git add packages/world-package
git commit -m "feat(world-package): freeze complete package v2 contract"
```

## Task 2: Assemble and independently verify the complete byte directory (`P14-PKG-02`)

**Depends on:** `P14-PKG-01`.

**Blocks:** signing, file publication, active consumer migration.

**Mode:** `sequential`.

**Files:**

- Create: `packages/world-package/src/v2-directory.ts`
- Create: `packages/world-package/src/v2-directory.test.ts`
- Modify: `packages/world-package/src/index.ts`
- Modify: `packages/world-package/package.json` (`jsonc-parser` direct dependency)
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
export interface WorldPackageDirectoryFileV2 {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface WorldPackageDirectoryV2 {
  readonly receipt: WorldPackageBuildReceiptV2;
  readonly files: readonly WorldPackageDirectoryFileV2[];
  readonly signatureFiles: readonly WorldPackageDirectoryFileV2[];
}

export interface VerifiedWorldPackageDirectoryV2 {
  readonly receipt: WorldPackageBuildReceiptV2;
  readonly authoringSpec?: AuthoringSpecV4;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly registryLock: readonly ExecutionResourceLockEntryV1[];
  readonly layoutSolveReport: LayoutSolveReportV1;
  readonly executionPlan: ExecutionPlanV5;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly resourceBytesByRef: ReadonlyMap<string, Uint8Array>;
  readonly signatureFiles: readonly WorldPackageDirectoryFileV2[];
}

assembleWorldPackageDirectoryV2(input: {
  readonly receipt: WorldPackageBuildReceiptV2;
  readonly files: readonly WorldPackageDirectoryFileV2[];
  readonly signatureFiles?: readonly WorldPackageDirectoryFileV2[];
}): WorldPackageDirectoryV2

verifyWorldPackageDirectoryV2(input: unknown): VerifiedWorldPackageDirectoryV2
```

- [ ] **Step 1: Write RED byte-level adversarial tests**

Cover shuffled files, duplicate paths, missing/extra path, unsafe path, symlink-like metadata rejection at the adapter boundary, wrong media type, changed bytes at same size, changed size, non-canonical JSON, duplicate JSON key, UTF-8 BOM, invalid UTF-8, invalid NOTICE/license bytes, `integrity.json` self-entry, `signatures/` root entry, and forged Package Root.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run packages/world-package/src/v2-directory.test.ts`

- [ ] **Step 3: Implement canonical JSON file parsing**

Use `jsonc-parser` to reject duplicate keys/comments/trailing commas before `JSON.parse`. Require canonical JSON bytes for every canonical JSON path by comparing the original bytes to `canonicalJsonBytes(parsed)`; binary resources remain byte-exact without decoding.

- [ ] **Step 4: Implement exact inventory verification**

The required V2 root inventory is exactly:

```text
manifest.json
world.normalized.json
registry-lock.json
layout-solve-report.json
targets/babylon-web/execution-plan.json
gameplay/bootstrap.json
NOTICE
every legal.licenseDocuments[].path
every manifest.resources[].packagePath
authoring-spec.json only when present in fileIntegrityEntries
```

`integrity.json` and `world-package-build-receipt.json` are transport metadata and must equal the receipt data but are excluded from `fileIntegrityEntries`; `signatures/` is verified separately and excluded from Root.

- [ ] **Step 5: Re-run owner parsers and closure checks**

After byte verification, parse Authoring V4, IR V4, Registry Lock, Layout Report, ExecutionPlan V5, and GameplayBootstrap V1 with their authoritative parsers. Recompute all cross-file hashes and require Manifest, Plan, Registry Lock, resource rows, world bounds, budgets, and initial controlled entity to match.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `pnpm exec vitest run packages/world-package/src/v2-contract.test.ts packages/world-package/src/v2-directory.test.ts && pnpm typecheck`

- [ ] **Step 7: Commit**

```bash
git add packages/world-package pnpm-lock.yaml
git commit -m "feat(world-package): verify complete package directories"
```

## Task 3: Build V2 from the exact trusted closure and legal provenance (`P14-PKG-03`)

**Depends on:** `P14-PKG-02`.

**Blocks:** durable publication and P1.6 Candidate migration.

**Mode:** `sequential`.

**Files:**

- Create: `packages/world-package/src/v2-build.ts`
- Create: `packages/world-package/src/v2-build.test.ts`
- Modify: `packages/world-package/src/index.ts`
- Modify: `scripts/lib/world-package-resource-resolver.ts`
- Modify: `scripts/lib/world-package-resource-resolver.test.ts`

**Interfaces:**

```ts
export interface ResolvedWorldPackageResourceArtifactV2 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly licenseDocumentId: string;
  readonly redistributionPolicy: "allowed" | "internal-only" | "prohibited";
  readonly sourceUri?: string;
  readonly author?: string;
}

export interface CreateWorldPackageV2Input {
  readonly packageId: string;
  readonly title: string;
  readonly sdkVersion: string;
  readonly distributionPolicy: WorldPackageDistributionPolicyV2;
  readonly canonicalAuthoringSchemaHash: WorldPackageSha256HashV1;
  readonly aiSchemaProjectionProfile: Readonly<{
    readonly resourceRef: string;
    readonly contentHash: WorldPackageSha256HashV1;
  }>;
  readonly hostCompatibility: WorldPackageHostCompatibilityV2;
  readonly authoringSpec: AuthoringSpecV4;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly layoutSolveResult: LayoutSolveResultV1;
  readonly executionPlan: ExecutionPlanV5;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV2[];
  readonly licenseDocuments: readonly Readonly<{
    readonly id: string;
    readonly spdxLicenseExpression: string;
    readonly path: `LICENSES/${string}`;
    readonly text: string;
  }>[];
  readonly noticeText: string;
  readonly includeAuthoringSpec: boolean;
}

createWorldPackageV2(input: CreateWorldPackageV2Input): WorldPackageDirectoryV2
```

- [ ] **Step 1: Write RED build-closure and legal-policy tests**

Reuse the existing asset-free, Golden Humanoid, G Bot, and Xier120 fixtures. Assert exact Resource Lock closure, source/license propagation, generated NOTICE and license bytes, V2 Root determinism, authoring omission, and that changing only legal text or Host profile changes Package Root.

- [ ] **Step 2: Add legal rejection matrix**

Assert `redistributable + internal-only`, either mode with `prohibited`, missing license document, unused license document, duplicate license ID/path, resource metadata not matching Registry provenance, and a Registry artifact byte mismatch all reject before a receipt is returned.

- [ ] **Step 3: Run RED**

Run: `pnpm exec vitest run packages/world-package/src/v2-build.test.ts scripts/lib/world-package-resource-resolver.test.ts`

- [ ] **Step 4: Implement V2 build by composing existing owners**

Do not duplicate Normalize, Compiler, Layout, Bootstrap, or Registry Lock logic. Reuse the V1 closure checks for the five existing hashes, then add V2 legal/compatibility/schema/profile bindings. Return a directory and immediately self-verify it before exposing it.

- [ ] **Step 5: Upgrade the resource resolver**

The resolver receives exact admitted `SubjectAssetManifestV1` rows and license documents; it must join provenance by `resourceRef`, reject discrepancies with the Normalized IR locked artifact metadata, and return `ResolvedWorldPackageResourceArtifactV2`. Do not read Registry from Runtime.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run packages/world-package/src/v2-*.test.ts scripts/lib/world-package-resource-resolver.test.ts
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/world-package scripts/lib/world-package-resource-resolver.ts scripts/lib/world-package-resource-resolver.test.ts
git commit -m "feat(world-package): build complete legal package closure"
```

## Task 4: Add Host compatibility and signature-policy gates (`P14-PKG-04`)

**Depends on:** `P14-PKG-03`.

**Blocks:** trusted `load` and publication.

**Mode:** `sequential`.

**Files:**

- Modify: `packages/world-package/src/v2-contract.ts`
- Modify: `packages/world-package/src/v2-contract.test.ts`
- Create: `scripts/lib/world-package-signing.ts`
- Create: `scripts/lib/world-package-signing.test.ts`

**Interfaces:**

```ts
export interface WorldPackageHostPolicyV1 {
  readonly acceptedRuntimeTargets: readonly ["babylon-web"];
  readonly acceptedPackageFormatVersions: readonly [2];
  readonly acceptedManifestSchemaVersions: readonly [2];
  readonly runtimeContractVersion: 1;
  readonly supportedFeatureIds: readonly string[];
  readonly trustedCompatibilityProfiles: readonly Readonly<{
    readonly profileRef: string;
    readonly profileHash: WorldPackageSha256HashV1;
  }>[];
  readonly allowedDistributionPolicies: readonly WorldPackageDistributionPolicyV2[];
  readonly signaturePolicy:
    | Readonly<{ readonly mode: "not-required" }>
    | Readonly<{ readonly mode: "required"; readonly trustDomain: string }>;
}

assertWorldPackageHostCompatibilityV2(
  manifest: WorldPackageManifestV2,
  policy: WorldPackageHostPolicyV1,
): void
```

- [ ] **Step 1: Write RED Host matrix tests**

Reject wrong runtime target, package/manifest version, runtime contract, unknown required feature, profile ref/hash mismatch, disallowed distribution policy, absent required signature, wrong trust domain, unknown key ID, altered signature envelope, altered signature bytes, invalid Base64, and non-Ed25519 keys.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run packages/world-package/src/v2-contract.test.ts scripts/lib/world-package-signing.test.ts`

- [ ] **Step 3: Implement provider-neutral compatibility admission**

Return stable errors beginning with one of:

```text
WORLD_PACKAGE_HOST_INCOMPATIBLE
WORLD_PACKAGE_SIGNATURE_REQUIRED
WORLD_PACKAGE_SIGNATURE_ENVELOPE_INVALID
WORLD_PACKAGE_SIGNATURE_UNTRUSTED
```

- [ ] **Step 4: Implement Node Ed25519 adapter**

Use `node:crypto` `sign`/`verify`. Keys enter only as caller-provided `KeyObject` or PEM at the trusted composition boundary. Logs and receipts contain `keyId` and `trustDomain`, never private key bytes or local key paths.

- [ ] **Step 5: Run focused tests and typecheck**

- [ ] **Step 6: Commit**

```bash
git add packages/world-package scripts/lib/world-package-signing.ts scripts/lib/world-package-signing.test.ts
git commit -m "feat(world-package): enforce host and signature policy"
```

## Task 5: Publish and read directories atomically (`P14-PKG-05`)

**Depends on:** `P14-PKG-04`.

**Blocks:** content-addressed Package store and CLI.

**Mode:** `sequential`.

**Files:**

- Create: `scripts/lib/file-world-package.ts`
- Create: `scripts/lib/file-world-package.test.ts`

**Interfaces:**

```ts
writeWorldPackageDirectoryV2(input: {
  readonly outputDirectoryPath: string;
  readonly directory: WorldPackageDirectoryV2;
}): Promise<void>

readWorldPackageDirectoryV2(input: {
  readonly packageDirectoryPath: string;
  readonly maximumTotalBytes: number;
  readonly maximumFileCount: number;
}): Promise<WorldPackageDirectoryV2>
```

- [ ] **Step 1: Write RED filesystem adversarial tests**

Cover non-absolute paths, existing destination, parent/file symlinks, nested symlink swap, file replacement during read, oversized file/total/count, wrong permissions, partial write failure, rename failure, missing directory fsync, and concurrent writers.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run scripts/lib/file-world-package.test.ts`

- [ ] **Step 3: Implement atomic publication**

Write into a sibling `mkdtemp` directory with mode `0700`, create files with `0600`, fsync each file and every created directory, self-read and verify, then rename once into a non-existing destination and fsync the parent. On failure remove only the validated sibling temporary directory.

- [ ] **Step 4: Implement symlink-safe reads**

Reject every symbolic link and non-regular file using `lstat`, require every resolved path to remain under the canonical root, snapshot size before/after read, and verify the resulting byte directory before returning.

- [ ] **Step 5: Run focused tests, workspace boundaries, and typecheck**

Run:

```bash
pnpm exec vitest run packages/world-package/src/v2-*.test.ts scripts/lib/world-package-*.test.ts scripts/lib/file-world-package.test.ts
pnpm verify:workspace-boundaries
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/file-world-package.ts scripts/lib/file-world-package.test.ts
git commit -m "feat(world-package): publish package directories atomically"
```

## Task 6: Add the content-addressed Package store and migrate active trusted consumers (`P14-PKG-06`)

**Depends on:** `P14-PKG-05`.

**Blocks:** persistent Candidate store, Runtime Session and P1.6 crash recovery plans.

**Mode:** `main-agent-only`.

**Files:**

- Modify: `packages/authoring-host/src/types.ts`
- Modify: `packages/authoring-host/src/build.ts`
- Modify: `packages/authoring-host/src/lease-store.ts`
- Modify: `packages/authoring-host/src/prepared-candidate.test.ts`
- Modify: `packages/authoring-host/src/journal/types.ts`
- Modify: `packages/authoring-host/src/journal/submit.ts`
- Create: `packages/world-package/src/store.ts`
- Create: `packages/world-package/src/store.test.ts`
- Create: `packages/world-package/src/testing.ts`
- Modify: `packages/world-package/package.json` to export `./testing`
- Modify: `scripts/lib/file-world-package.ts`
- Modify: `scripts/lib/file-world-package.test.ts`
- Modify: `packages/runtime-host/src/runtime-host.ts`
- Modify: `packages/runtime-host/src/test/runtime-host-lifecycle-harness.ts`
- Modify: `packages/validation/src/world-package-validation-subject.ts`
- Modify: `packages/validation/src/world-package-validation-subject.test.ts`
- Modify: `apps/playground/src/authoring-loader.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `scripts/lib/route-validation-runner.ts`
- Modify: `scripts/lib/route-validation-runner.test.ts`
- Modify: `scripts/lib/simulation-take-cli.ts`
- Modify: `scripts/lib/simulation-take-cli.test.ts`
- Modify: `packages/runtime-host/src/publication-v2.test.ts`
- Modify: `packages/runtime-host/src/runtime-host-lifecycle.test.ts`
- Modify: `packages/runtime-host/src/runtime-host.test.ts`
- Modify: `packages/authoring-host/src/journal/journal.test.ts`
- Modify: `packages/authoring-host/src/journal/publication-adversarial.test.ts`
- Modify tracked Package/Validation fixtures only when their exact V2 bytes change, and record each changed artifact path in the Task 7 completion evidence.

**Interfaces:**

- Active `RuntimeWorldConfigurationV1.worldPackageBuildReceipt` becomes `WorldPackageBuildReceiptV2`; the containing Runtime configuration does not gain filesystem paths.
- `PreparedCandidateLeaseV1` retains only the content-addressed `worldPackageRef`, `WorldPackageBuildReceiptV2`, build/report bindings and lease identity; it does not retain a second copy of Authoring/Plan/Bootstrap/package bytes.
- Package references use the exact form `package://world-package/sha256/<64-lowercase-hex>` and must match the stored V2 Root.
- Validation consumes `VerifiedWorldPackageDirectoryV2`, not independently assembled hash fields.

```ts
export interface WorldPackageStoreV1 {
  readonly brand: "WorldPackageStoreV1";
  put(directory: WorldPackageDirectoryV2): Promise<Readonly<{
    readonly worldPackageRef: `package://world-package/sha256/${string}`;
    readonly receipt: WorldPackageBuildReceiptV2;
  }>>;
  get(
    worldPackageRef: `package://world-package/sha256/${string}`,
  ): Promise<VerifiedWorldPackageDirectoryV2 | undefined>;
}
```

- [ ] **Step 1: Write RED content-addressed store tests**

Assert idempotent same-byte put, same-Root/different-byte conflict rejection, Ref/Root mismatch, corrupt stored directory, concurrent put, absent get, and no local path in returned values. The file store must replay a valid package after a fresh adapter instance.

- [ ] **Step 2: Run store RED**

Run: `pnpm exec vitest run packages/world-package/src/store.test.ts scripts/lib/file-world-package.test.ts`

- [ ] **Step 3: Implement the store port and adapters**

Provide a verified in-memory adapter only under `@whitebox-world/world-package/testing` for deterministic tests. The production file adapter stores packages under `<store-root>/sha256/<hex>/` by calling the Task 5 atomic directory writer; `get()` always re-verifies bytes and never trusts the directory name.

- [ ] **Step 4: Change consumer type assertions to V2 and capture compile RED**

Run: `pnpm typecheck`

Expected: only the named V1 consumers fail.

- [ ] **Step 5: Migrate trusted builders and fixtures without compatibility aliases**

Make `prepareTrustedCandidateV1()` asynchronous and inject `WorldPackageStoreV1`. Every active producer supplies exact legal, AI Schema, Registry and Host profile context, builds a self-verified V2 directory, stores it, and records only its returned Ref/Receipt. Test-only fixtures use an explicit fixture context helper; production code must not import that helper.

- [ ] **Step 6: Migrate Runtime/Validation inputs**

Before publication, the composition owner resolves `worldPackageRef` through the store and constructs `TrustedRuntimeWorldConfigurationV1` from the returned verified directory. Runtime may reparse the Build Receipt and Gameplay Bootstrap membership but must not open files, resolve Registry Refs, or accept V1.

- [ ] **Step 7: Correct the P1.6 Registry Lock binding**

`WorldChangeBuildIdentityV1.registryLockHash` must come from `WorldPackageManifestV2.registryLockHash`, which hashes the exact used `registry-lock.json`. The broader Authoring/Edit policy Registry Lock remains part of `authoringEditPolicyHash` and admission; it is not substituted for the package's used-resource closure.

- [ ] **Step 8: Add V1 rejection and explicit migration tests**

Active load/publication paths reject V1 with `WORLD_PACKAGE_VERSION_UNSUPPORTED`; the migration CLI/library can convert V1 only when all V2 context is supplied and emits `WorldPackageMigrationReportV1`.

- [ ] **Step 9: Run affected tests**

Run all files named above plus:

```bash
pnpm typecheck
pnpm test:census
pnpm verify:workspace-boundaries
```

- [ ] **Step 10: Commit**

```bash
git add packages apps/playground/src scripts/lib pnpm-lock.yaml
git commit -m "refactor(world-package): migrate trusted consumers to v2"
```

## Task 7: Complete Package V2 evidence and truth update (`P14-PKG-07`)

**Depends on:** `P14-PKG-06`.

**Blocks:** persistent Runtime Session and P1.6 startup recovery implementation.

**Mode:** `main-agent-only`.

**Files:**

- Modify: `docs/18-refactor-progress-and-backlog.md` P1.4 only after evidence passes
- Modify: `docs/02-sdk-architecture.md` only to remove the stale “complete package not implemented” claim
- Add: `docs/reviews/2026-08-27-p14-complete-world-package-v2-completion.md`

- [ ] **Step 1: Run focused package and migration gates**

```bash
pnpm exec vitest run packages/world-package/src/*.test.ts scripts/lib/world-package-*.test.ts scripts/lib/file-world-package.test.ts
pnpm typecheck
pnpm verify:workspace-boundaries
pnpm test:census
git diff --check
```

- [ ] **Step 2: Run repository gates affected by the public migration**

```bash
pnpm test
pnpm build
```

- [ ] **Step 3: Perform a real directory round trip**

Package one existing asset-free world and one rigged world into temporary absolute directories, inspect them in a fresh process, verify Package Root equality, load their Runtime configurations, and confirm corruption of one JSON byte and one GLB byte fails before Runtime adapter creation.

- [ ] **Step 4: Audit requirements and hard constraints**

Confirm no active production consumer accepts V1; V1 remains only in migration/test/history paths. Confirm no `node:*` under `packages/world-package`, no new Browser V5 key, no `authoring-host` → `runtime-host` dependency, no `rebaseRequired`, and unchanged P1.6 spec status header.

- [ ] **Step 5: Write evidence and update only proven P1.4 rows**

Mark the directory/Manifest and integrity/signature-input/License/Host Compatibility rows complete. Leave CLI `package/inspect/load/run-session`, persistent Runtime Session, publication recovery, cleanup ledger, Provider round-trip, manual playtest, and Incremental rows open.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs(world-package): record complete package v2 evidence"
```

## Plan self-review checklist

- [ ] Every P1.4 package requirement maps to a task and evidence command.
- [ ] V1 remains unchanged and is not presented as complete V2.
- [ ] No placeholder, optional “simple version”, or deferred correctness path exists.
- [ ] V2 field names match the public naming rules (`...Ref`, `...Hash`, units, plural collections, closed discriminators).
- [ ] Every later interface uses the exact names declared earlier.
- [ ] Filesystem and signing code remain outside provider-neutral packages.
- [ ] Runtime never reads Registry, Authoring provenance, local paths, or signing keys.
- [ ] Package V2 completion does not claim Runtime Session, P1.6 production GO, or Incremental completion.
