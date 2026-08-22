import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import {
  hashLayoutSolveReportV1,
  type LayoutSolveResultV1,
} from "@whitebox-world/layout-solver";
import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  assertWorldPackageBuildReceiptV1,
  createWorldPackageBuildReceiptV1,
  type CreateWorldPackageBuildReceiptInputV1,
  type WorldPackageBuildReceiptV1,
} from "./index.js";
import {
  createValidAuthoringSpec,
  createValidRiggedPackageDefinition,
  createValidRiggedPackageSubjectWorld,
} from "../../authoring/src/test-fixture.js";

function asV4(
  source: ReturnType<typeof createValidAuthoringSpec>,
): AuthoringSpecV4 {
  return {
    ...source,
    schemaVersion: 4,
    constraints: {
      placements: source.constraints.placements,
      connectivity: [],
    },
  };
}

function compileInput(
  authoringSpec: AuthoringSpecV4,
  overrides: Partial<CreateWorldPackageBuildReceiptInputV1> = {},
): CreateWorldPackageBuildReceiptInputV1 {
  const normalized = normalizeAuthoringSpecV4(authoringSpec);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined ||
    normalized.layoutSolveReport === undefined ||
    normalized.layoutSolveReportHash === undefined
  ) {
    throw new Error(`fixture normalization failed: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error(`fixture compilation failed: ${JSON.stringify(compiled.diagnostics)}`);
  }
  const layoutSolveResult: LayoutSolveResultV1 = {
    status: normalized.layoutSolveReport.status,
    report: normalized.layoutSolveReport,
    layoutSolveReportHash: normalized.layoutSolveReportHash,
  };
  return {
    packageId: `${authoringSpec.id}.package`,
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult,
    executionPlan: compiled.executionPlan,
    resourceArtifacts: [],
    ...overrides,
  };
}

function assetFreeInput(seed = 1024): CreateWorldPackageBuildReceiptInputV1 {
  const source = createValidAuthoringSpec();
  return compileInput(asV4({ ...source, seed }));
}

async function riggedInput(): Promise<CreateWorldPackageBuildReceiptInputV1> {
  const v3 = createValidRiggedPackageSubjectWorld();
  const bytes = new Uint8Array(await readFile(new URL(
    "../../../apps/playground/public/worldkit-assets/golden-humanoid.glb",
    import.meta.url,
  )));
  return compileInput(asV4(v3), {
    resourceArtifacts: [{
      resourceRef: "worldkit://subject-asset/humanoid.golden@1",
      packagePath: "resources/subject-assets/humanoid.golden.glb",
      mediaType: "model/gltf-binary",
      bytes,
    }],
  });
}

async function uninstantiatedRiggedResourceInput(): Promise<CreateWorldPackageBuildReceiptInputV1> {
  const base = createValidAuthoringSpec();
  const v4 = asV4({
    ...base,
    resources: {
      ...base.resources,
      subjectDefinitions: [createValidRiggedPackageDefinition()],
    },
  });
  const bytes = new Uint8Array(await readFile(new URL(
    "../../../apps/playground/public/worldkit-assets/golden-humanoid.glb",
    import.meta.url,
  )));
  return compileInput(v4, {
    resourceArtifacts: [{
      resourceRef: "worldkit://subject-asset/humanoid.golden@1",
      packagePath: "resources/subject-assets/humanoid.golden.glb",
      mediaType: "model/gltf-binary",
      bytes,
    }],
  });
}

describe("WorldPackageBuildReceiptV1", () => {
  it("builds a deterministic asset-free receipt from real V4/V4/V5 artifacts", () => {
    const first = createWorldPackageBuildReceiptV1(assetFreeInput());
    const repeated = createWorldPackageBuildReceiptV1(assetFreeInput());

    expect(repeated).toEqual(first);
    expect(first.manifest).toMatchObject({
      worldId: "basic-world",
      seed: 1024,
      controlledEntityId: "player",
      resources: [],
    });
    expect(first.fileIntegrityEntries.map((row) => row.path)).toEqual([
      "authoring-spec.json",
      "layout-solve-report.json",
      "manifest.json",
      "registry-lock.json",
      "targets/babylon-web/execution-plan.json",
      "world.normalized.json",
    ]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.manifest)).toBe(true);
    expect(Object.isFrozen(first.fileIntegrityEntries)).toBe(true);
    expect(Object.isFrozen(first.fileIntegrityEntries[0])).toBe(true);
    expect(assertWorldPackageBuildReceiptV1(first)).toEqual(first);
  });

  it("verifies real asset bytes and binds them into Manifest, integrity, and Root", async () => {
    const input = await riggedInput();
    const receipt = createWorldPackageBuildReceiptV1(input);
    const artifact = input.resourceArtifacts[0]!;

    expect(receipt.manifest.resources).toEqual([{
      resourceRef: artifact.resourceRef,
      packagePath: artifact.packagePath,
      mediaType: artifact.mediaType,
      sizeBytes: artifact.bytes.byteLength,
      contentHash: sha256Bytes(artifact.bytes),
    }]);
    expect(receipt.fileIntegrityEntries).toContainEqual({
      path: artifact.packagePath,
      mediaType: artifact.mediaType,
      sizeBytes: artifact.bytes.byteLength,
      sha256: sha256Bytes(artifact.bytes),
    });
    expect(receipt.worldPackageRootHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("changes the Resource Lock child identity and Root when the real resource closure changes", async () => {
    const assetFree = createWorldPackageBuildReceiptV1(assetFreeInput());
    const rigged = createWorldPackageBuildReceiptV1(await riggedInput());

    expect(rigged.manifest.resourceLockHash).not.toBe(
      assetFree.manifest.resourceLockHash,
    );
    expect(rigged.worldPackageRootHash).not.toBe(assetFree.worldPackageRootHash);
  });

  it("packages assets referenced by Normalized IR even when no active Subject reaches them", async () => {
    const input = await uninstantiatedRiggedResourceInput();
    expect(input.normalizedWorldIr.resources.subjectAssets).toHaveLength(1);
    expect(input.executionPlan.subjectAssets).toEqual([]);

    const receipt = createWorldPackageBuildReceiptV1(input);

    expect(receipt.manifest.resources.map((row) => row.resourceRef)).toEqual([
      "worldkit://subject-asset/humanoid.golden@1",
    ]);
  });

  it("changes the canonical identities and Root when a real world input changes", () => {
    const first = createWorldPackageBuildReceiptV1(assetFreeInput(1024));
    const changed = createWorldPackageBuildReceiptV1(assetFreeInput(2048));

    expect(changed.manifest.authoringSpecHash).not.toBe(
      first.manifest.authoringSpecHash,
    );
    expect(changed.manifest.normalizedWorldIrHash).not.toBe(
      first.manifest.normalizedWorldIrHash,
    );
    expect(changed.manifest.executionPlanHash).not.toBe(
      first.manifest.executionPlanHash,
    );
    expect(changed.manifest.layoutSolveReportHash).not.toBe(
      first.manifest.layoutSolveReportHash,
    );
    expect(changed.worldPackageRootHash).not.toBe(first.worldPackageRootHash);
  });

  it("computes file rows from the actual canonical JSON bytes", () => {
    const input = assetFreeInput();
    const receipt = createWorldPackageBuildReceiptV1(input);
    const expectedByPath = new Map([
      ["authoring-spec.json", canonicalJsonBytes(input.authoringSpec)],
      ["world.normalized.json", canonicalJsonBytes(input.normalizedWorldIr)],
      ["registry-lock.json", canonicalJsonBytes(input.normalizedWorldIr.resources.resourceLock)],
      ["layout-solve-report.json", canonicalJsonBytes(input.layoutSolveResult.report)],
      ["targets/babylon-web/execution-plan.json", canonicalJsonBytes(input.executionPlan)],
    ]);

    for (const [path, bytes] of expectedByPath) {
      expect(receipt.fileIntegrityEntries).toContainEqual({
        path,
        mediaType: "application/json",
        sizeBytes: bytes.byteLength,
        sha256: sha256Bytes(bytes),
      });
    }
    const manifestBytes = canonicalJsonBytes(receipt.manifest);
    expect(receipt.manifestHash).toBe(sha256Bytes(manifestBytes));
    expect(receipt.fileIntegrityEntries).toContainEqual({
      path: "manifest.json",
      mediaType: "application/json",
      sizeBytes: manifestBytes.byteLength,
      sha256: receipt.manifestHash,
    });
    expect(receipt.worldPackageRootHash).toBe(sha256CanonicalJson({
      packageFormatVersion: 1,
      canonicalizationProfile: "canonical-json-jcs@1",
      hashAlgorithm: "sha256",
      files: receipt.fileIntegrityEntries,
    }));
  });

  it("rejects missing, changed, duplicate, and unsafe resolved asset bytes", async () => {
    const input = await riggedInput();
    const artifact = input.resourceArtifacts[0]!;

    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      resourceArtifacts: [],
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_INVALID");
    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      resourceArtifacts: [{ ...artifact, bytes: new Uint8Array([1, 2, 3]) }],
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_INVALID");
    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      resourceArtifacts: [artifact, { ...artifact }],
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_INVALID");
    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      resourceArtifacts: [{ ...artifact, packagePath: "../asset.glb" }],
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_INVALID");
  });

  it("fails closed on cross-world artifacts instead of accepting a hash bag", () => {
    const first = assetFreeInput(1024);
    const other = assetFreeInput(2048);

    for (const mixed of [
      { ...first, normalizedWorldIr: other.normalizedWorldIr },
      { ...first, layoutSolveResult: other.layoutSolveResult },
      { ...first, executionPlan: other.executionPlan },
    ]) {
      expect(() => createWorldPackageBuildReceiptV1(mixed)).toThrow(
        "WORLD_PACKAGE_BUILD_INPUT_INVALID",
      );
    }
  });

  it("rejects a consistently rehashed Layout report that is not the IR and Plan solver receipt", () => {
    const input = assetFreeInput();
    const report = {
      ...input.layoutSolveResult.report,
      solverProfileRef: "worldkit://layout-solver-profile/forged@1",
    };
    const layoutSolveReportHash = hashLayoutSolveReportV1(report);
    const normalizedWorldIr = {
      ...input.normalizedWorldIr,
      layout: {
        ...input.normalizedWorldIr.layout,
        layoutSolveReportHash,
      },
    };
    const executionPlan = {
      ...input.executionPlan,
      normalizedWorldIrHash: sha256CanonicalJson(normalizedWorldIr),
      layout: {
        ...input.executionPlan.layout,
        layoutSolveReportHash,
      },
    };

    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      normalizedWorldIr,
      layoutSolveResult: {
        status: "solved",
        report,
        layoutSolveReportHash,
      },
      executionPlan,
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_INVALID");
  });

  it("rejects each declared child-identity mismatch at its authoritative boundary", () => {
    const input = assetFreeInput();
    const forged = `sha256:${"f".repeat(64)}` as const;
    const cases: readonly CreateWorldPackageBuildReceiptInputV1[] = [
      {
        ...input,
        normalizedWorldIr: { ...input.normalizedWorldIr, authoringSpecHash: forged },
      },
      {
        ...input,
        executionPlan: { ...input.executionPlan, normalizedWorldIrHash: forged },
      },
      {
        ...input,
        executionPlan: { ...input.executionPlan, resourceLockHash: forged },
      },
      {
        ...input,
        executionPlan: {
          ...input.executionPlan,
          layout: { ...input.executionPlan.layout, layoutSolveReportHash: forged },
        },
      },
      {
        ...input,
        layoutSolveResult: { ...input.layoutSolveResult, layoutSolveReportHash: forged },
      },
    ];

    for (const candidate of cases) {
      expect(() => createWorldPackageBuildReceiptV1(candidate)).toThrow(
        "WORLD_PACKAGE_BUILD_INPUT_INVALID",
      );
    }
  });

  it("recomputes the execution Plan child hash and rejects semantic cross-binding drift", () => {
    const baselineInput = assetFreeInput();
    const baseline = createWorldPackageBuildReceiptV1(baselineInput);
    const changedPlan = {
      ...baselineInput.executionPlan,
      atmospherePreset: "overcast" as const,
    };
    expect(baseline.manifest.executionPlanHash).toBe(
      sha256CanonicalJson(baselineInput.executionPlan),
    );
    expect(() => createWorldPackageBuildReceiptV1({
      ...baselineInput,
      executionPlan: changedPlan,
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_INVALID");
  });

  it("rejects an Execution Plan whose object transform was not compiled from the supplied IR", () => {
    const input = assetFreeInput();
    const executionPlan = structuredClone(input.executionPlan);
    const firstObject = executionPlan.objects[0];
    if (firstObject === undefined) throw new Error("fixture must contain an object");
    const mutablePosition = firstObject.transform.positionMetersXYZ as unknown as number[];
    mutablePosition[0] = mutablePosition[0]! + 777;

    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      executionPlan,
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_INVALID");
  });

  it("rejects accessor-bearing build input before reading the accessor", () => {
    const input = assetFreeInput();
    let readCount = 0;
    Object.defineProperty(input.executionPlan, "controlledEntityId", {
      configurable: true,
      enumerable: true,
      get: () => {
        readCount += 1;
        return "player";
      },
    });

    expect(() => createWorldPackageBuildReceiptV1(input)).toThrow(
      "WORLD_PACKAGE_BUILD_INPUT_ACCESSOR_FORBIDDEN",
    );
    expect(readCount).toBe(0);
  });

  it("rejects unknown fields, all-zero hashes, exclusions, and receipt cross-binding", () => {
    const receipt = createWorldPackageBuildReceiptV1(assetFreeInput());
    expect(() => assertWorldPackageBuildReceiptV1({
      ...receipt,
      createdAt: "2026-08-23T00:00:00Z",
    })).toThrow("WORLD_PACKAGE_BUILD_RECEIPT_INVALID");
    expect(() => assertWorldPackageBuildReceiptV1({
      ...receipt,
      manifestHash: `sha256:${"0".repeat(64)}`,
    })).toThrow("WORLD_PACKAGE_BUILD_RECEIPT_INVALID");
    expect(() => assertWorldPackageBuildReceiptV1({
      ...receipt,
      fileIntegrityEntries: [
        ...receipt.fileIntegrityEntries,
        {
          path: "integrity.json",
          mediaType: "application/json",
          sizeBytes: 2,
          sha256: sha256Bytes(new TextEncoder().encode("{}")),
        },
      ],
    })).toThrow("WORLD_PACKAGE_BUILD_RECEIPT_INVALID");
    expect(() => assertWorldPackageBuildReceiptV1({
      ...receipt,
      worldPackageRootHash: receipt.manifestHash,
    })).toThrow("WORLD_PACKAGE_BUILD_RECEIPT_INVALID");

    const symbolKeyed = structuredClone(receipt) as WorldPackageBuildReceiptV1 & {
      [key: symbol]: string;
    };
    symbolKeyed[Symbol("hidden")] = "machine-state";
    expect(() => assertWorldPackageBuildReceiptV1(symbolKeyed)).toThrow(
      "WORLD_PACKAGE_BUILD_RECEIPT_SYMBOL_KEY_FORBIDDEN",
    );
  });

  it("snapshots resource bytes so mutation after the call cannot alter the receipt", async () => {
    const input = await riggedInput();
    const receipt = createWorldPackageBuildReceiptV1(input);
    const before = structuredClone(receipt);

    input.resourceArtifacts[0]!.bytes.fill(0);

    expect(receipt).toEqual(before);
    expect(assertWorldPackageBuildReceiptV1(receipt)).toEqual(before);
  });

  it("rejects SharedArrayBuffer-backed resource bytes before cloning them", async () => {
    const input = await riggedInput();
    const artifact = input.resourceArtifacts[0]!;
    const sharedBytes = new Uint8Array(new SharedArrayBuffer(artifact.bytes.byteLength));
    sharedBytes.set(artifact.bytes);

    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      resourceArtifacts: [{ ...artifact, bytes: sharedBytes }],
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_SHARED_MEMORY_FORBIDDEN");
  });

  it("rejects own non-index accessors on resource bytes without invoking them", async () => {
    const input = await riggedInput();
    const artifact = input.resourceArtifacts[0]!;
    const bytes = new Uint8Array(artifact.bytes);
    let readCount = 0;
    Object.defineProperty(bytes, "hiddenState", {
      enumerable: false,
      get: () => {
        readCount += 1;
        return "mutable";
      },
    });

    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      resourceArtifacts: [{ ...artifact, bytes }],
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_ACCESSOR_FORBIDDEN");
    expect(readCount).toBe(0);
  });

  it("does not invoke a prototype-poisoned buffer getter while admitting resource bytes", async () => {
    const input = await riggedInput();
    const artifact = input.resourceArtifacts[0]!;
    const bytes = new Uint8Array(artifact.bytes);
    let readCount = 0;
    const poisonedPrototype = Object.create(Uint8Array.prototype) as Uint8Array;
    Object.defineProperty(poisonedPrototype, "buffer", {
      configurable: true,
      get: () => {
        readCount += 1;
        throw new Error("prototype getter must not execute");
      },
    });
    Object.setPrototypeOf(bytes, poisonedPrototype);

    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      resourceArtifacts: [{ ...artifact, bytes }],
    })).not.toThrow();
    expect(readCount).toBe(0);
  });

  it("rejects symbol-keyed state attached to resource bytes", async () => {
    const input = await riggedInput();
    const artifact = input.resourceArtifacts[0]!;
    const bytes = new Uint8Array(artifact.bytes) as Uint8Array & {
      [key: symbol]: string;
    };
    bytes[Symbol("hidden")] = "mutable";

    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      resourceArtifacts: [{ ...artifact, bytes }],
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_SYMBOL_KEY_FORBIDDEN");
  });

  it("rejects detached resource bytes with a stable admission error", async () => {
    const input = await riggedInput();
    const artifact = input.resourceArtifacts[0]!;
    const bytes = new Uint8Array(artifact.bytes);
    structuredClone(bytes.buffer, { transfer: [bytes.buffer] });

    expect(() => createWorldPackageBuildReceiptV1({
      ...input,
      resourceArtifacts: [{ ...artifact, bytes }],
    })).toThrow("WORLD_PACKAGE_BUILD_INPUT_DETACHED_BUFFER_FORBIDDEN");
  });
});
