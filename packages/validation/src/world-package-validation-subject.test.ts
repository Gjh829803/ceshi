import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import type { LayoutSolveResultV1 } from "@whitebox-world/layout-solver";
import { canonicalJsonBytes, sha256Bytes } from "@whitebox-world/protocol";
import {
  canonicalExecutionResourceLockEntriesV1,
} from "@whitebox-world/runtime-contracts";
import {
  assertWorldPackageBuildReceiptV1,
  canonicalWorldPackageFileIntegrityEntriesV1,
  createWorldPackageBuildReceiptV1,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
  type CreateWorldPackageBuildReceiptInputV1,
  type WorldPackageBuildReceiptV1,
  type WorldPackageFileIntegrityEntryV1,
  type WorldPackageManifestV1,
  type WorldPackageSha256HashV1,
} from "@whitebox-world/world-package";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import { createValidAuthoringSpec } from "../../authoring/src/test-fixture.js";
import {
  createWorldPackageValidationSubjectV1,
  type CreateWorldPackageValidationSubjectInputV1,
} from "./index.js";

function asV4(
  source: ReturnType<typeof createValidAuthoringSpec>,
): AuthoringSpecV4 {
  return {
    ...source,
    schemaVersion: 4,
    spatial: { ...source.spatial, traversalAreas: [] },
    constraints: {
      placements: source.constraints.placements,
      connectivity: [],
    },
  };
}

function createGameplayBootstrap(
  authoringSpec: AuthoringSpecV4,
  normalizedWorldIr: NonNullable<
    ReturnType<typeof normalizeAuthoringSpecV4>["value"]
  >,
): GameplayBootstrapV1 {
  return createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: `${authoringSpec.id}.${authoringSpec.seed}.gameplay`,
    version: 1,
    resourceRef:
      `worldkit://gameplay-bootstrap/${authoringSpec.id}.${authoringSpec.seed}@1`,
    entityDescriptors: normalizedWorldIr.nodes
      .filter((node) => node.kind === "subject")
      .map((node) => {
        const definition = normalizedWorldIr.resources.subjectDefinitions.find(
          (candidate) =>
            candidate.subjectDefinitionRef === node.subjectDefinitionRef,
        );
        if (isNil(definition)) {
          throw new Error(
            `missing fixture Subject Definition '${node.subjectDefinitionRef}'`,
          );
        }
        return {
          id: node.id,
          entityDefinitionRef: node.subjectDefinitionRef,
          capabilityRefs: definition.capabilityRefs,
        };
      }),
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
  });
}

function createFixture(
  seed = 1024,
): Readonly<{
  packageInput: CreateWorldPackageBuildReceiptInputV1;
  validationInput: CreateWorldPackageValidationSubjectInputV1;
}> {
  const source = createValidAuthoringSpec();
  const authoringSpec = asV4({ ...source, seed });
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
  const gameplayBootstrap = createGameplayBootstrap(authoringSpec, normalized.value);
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
  });
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error(`fixture compilation failed: ${JSON.stringify(compiled.diagnostics)}`);
  }
  const layoutSolveResult: LayoutSolveResultV1 = {
    status: normalized.layoutSolveReport.status,
    report: normalized.layoutSolveReport,
    layoutSolveReportHash: normalized.layoutSolveReportHash,
  };
  const packageInput: CreateWorldPackageBuildReceiptInputV1 = {
    packageId: `${authoringSpec.id}.package`,
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult,
    executionPlan: compiled.executionPlan,
    gameplayBootstrap,
    resourceArtifacts: [],
  };
  return {
    packageInput,
    validationInput: {
      worldPackageBuildReceipt: createWorldPackageBuildReceiptV1(packageInput),
      authoringSpec,
      normalizedWorldIr: normalized.value,
      layoutSolveResult,
      executionPlan: compiled.executionPlan,
      gameplayBootstrap,
    },
  };
}

function resignReceipt(
  receipt: WorldPackageBuildReceiptV1,
  manifest: WorldPackageManifestV1,
  entries: readonly WorldPackageFileIntegrityEntryV1[],
): WorldPackageBuildReceiptV1 {
  const manifestHash = hashWorldPackageManifestV1(manifest);
  const fileIntegrityEntries = canonicalWorldPackageFileIntegrityEntriesV1([
    ...entries.filter((entry) => entry.path !== "manifest.json"),
    {
      path: "manifest.json",
      mediaType: "application/json",
      sizeBytes: canonicalJsonBytes(manifest).byteLength,
      sha256: manifestHash,
    },
  ]);
  return {
    ...receipt,
    manifest,
    manifestHash,
    fileIntegrityEntries,
    worldPackageRootHash: hashWorldPackageRootV1(fileIntegrityEntries),
  };
}

describe("WorldPackageValidationSubjectV1 assembly", () => {
  it("derives the exact canonical subject from one validated package build", () => {
    const { validationInput } = createFixture();
    const subject = createWorldPackageValidationSubjectV1(validationInput);

    expect(subject).toEqual({
      kind: "world-package",
      worldPackageRootHash: validationInput.worldPackageBuildReceipt.worldPackageRootHash,
      authoringSpecHash: validationInput.worldPackageBuildReceipt.manifest.authoringSpecHash,
      normalizedWorldIrHash:
        validationInput.worldPackageBuildReceipt.manifest.normalizedWorldIrHash,
      executionPlanHash: validationInput.worldPackageBuildReceipt.manifest.executionPlanHash,
      resourceLockHash: validationInput.worldPackageBuildReceipt.manifest.resourceLockHash,
      layoutSolveReportHash:
        validationInput.worldPackageBuildReceipt.manifest.layoutSolveReportHash,
    });
    expect(Object.keys(subject).sort()).toEqual([
      "authoringSpecHash",
      "executionPlanHash",
      "kind",
      "layoutSolveReportHash",
      "normalizedWorldIrHash",
      "resourceLockHash",
      "worldPackageRootHash",
    ]);
    expect(Object.isFrozen(subject)).toBe(true);
    expect(validationInput.worldPackageBuildReceipt.manifest.initialControlledEntityId)
      .toBe(validationInput.executionPlan.initialControlledEntityId);
    const expectedPlanResourceLock = canonicalExecutionResourceLockEntriesV1([
      ...validationInput.normalizedWorldIr.resources.resourceLock,
      createGameplayBootstrapResourceLockEntryV1(
        validationInput.gameplayBootstrap,
      ),
    ]);
    expect(validationInput.executionPlan.resourceLockEntries).toEqual(
      expectedPlanResourceLock,
    );
    expect(validationInput.executionPlan.resourceLockEntries).toHaveLength(
      validationInput.normalizedWorldIr.resources.resourceLock.length + 1,
    );
    expect(
      validationInput.executionPlan.resourceLockEntries.filter(
        (entry) => entry.resourceKind === "gameplay-bootstrap",
      ),
    ).toHaveLength(1);
  });

  it("binds a V4 world whose Prototypes restore Traversal Surface bindings", () => {
    const source = createValidAuthoringSpec();
    const authoringSpec: AuthoringSpecV4 = {
      ...asV4(source),
      resources: {
        ...source.resources,
        prototypes: source.resources.prototypes.map((prototype, index) =>
          index !== 0
            ? prototype
            : {
                ...prototype,
                traversalSurfaceBindings: [{
                  id: "deck",
                  kind: "collider-subshape",
                  logicalSubshapeId: "primary",
                  traversalSurfaceProfileRef:
                    "worldkit://traversal-surface-profile/ground.static@1",
                }],
              },
        ),
      },
    };
    const { validationInput } = (() => {
      const normalized = normalizeAuthoringSpecV4(authoringSpec);
      if (
        !normalized.ok ||
        normalized.value === undefined ||
        normalized.normalizedWorldIrHash === undefined ||
        normalized.layoutSolveReport === undefined ||
        normalized.layoutSolveReportHash === undefined
      ) {
        throw new Error(`bound fixture normalization failed: ${JSON.stringify(normalized.diagnostics)}`);
      }
      const gameplayBootstrap = createGameplayBootstrap(
        authoringSpec,
        normalized.value,
      );
      const compiled = compileWorldV5({
        normalizedWorldIr: normalized.value,
        normalizedWorldIrHash: normalized.normalizedWorldIrHash,
        gameplayBootstrapResourceLock:
          createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
      });
      if (!compiled.ok || compiled.executionPlan === undefined) {
        throw new Error(`bound fixture compilation failed: ${JSON.stringify(compiled.diagnostics)}`);
      }
      const layoutSolveResult: LayoutSolveResultV1 = {
        status: normalized.layoutSolveReport.status,
        report: normalized.layoutSolveReport,
        layoutSolveReportHash: normalized.layoutSolveReportHash,
      };
      const packageInput: CreateWorldPackageBuildReceiptInputV1 = {
        packageId: `${authoringSpec.id}.package`,
        authoringSpec,
        normalizedWorldIr: normalized.value,
        layoutSolveResult,
        executionPlan: compiled.executionPlan,
        gameplayBootstrap,
        resourceArtifacts: [],
      };
      return {
        validationInput: {
          worldPackageBuildReceipt: createWorldPackageBuildReceiptV1(packageInput),
          authoringSpec,
          normalizedWorldIr: normalized.value,
          layoutSolveResult,
          executionPlan: compiled.executionPlan,
          gameplayBootstrap,
        },
      };
    })();
    const subject = createWorldPackageValidationSubjectV1(validationInput);
    expect(subject.resourceLockHash).toBe(
      validationInput.executionPlan.resourceLockHash,
    );
    expect(subject.resourceLockHash).not.toBe(
      validationInput.normalizedWorldIr.resources.resourceLockHash,
    );
    expect(subject.layoutSolveReportHash).toBe(
      validationInput.layoutSolveResult.layoutSolveReportHash,
    );
  });

  it("is deterministic and detached from later caller mutation", () => {
    const { validationInput } = createFixture();
    const subject = createWorldPackageValidationSubjectV1(validationInput);
    const repeated = createWorldPackageValidationSubjectV1(validationInput);

    expect(repeated).toEqual(subject);
    (validationInput.authoringSpec as unknown as { seed: number }).seed = 999;
    expect(subject.authoringSpecHash).toBe(
      validationInput.worldPackageBuildReceipt.manifest.authoringSpecHash,
    );
  });

  it("rejects every cross-world Authoring, IR, Layout, Plan, or Receipt mixture", () => {
    const first = createFixture(1024).validationInput;
    const other = createFixture(2048).validationInput;
    const cases: readonly CreateWorldPackageValidationSubjectInputV1[] = [
      { ...first, worldPackageBuildReceipt: other.worldPackageBuildReceipt },
      { ...first, authoringSpec: other.authoringSpec },
      { ...first, normalizedWorldIr: other.normalizedWorldIr },
      { ...first, layoutSolveResult: other.layoutSolveResult },
      { ...first, executionPlan: other.executionPlan },
      { ...first, gameplayBootstrap: other.gameplayBootstrap },
    ];

    for (const candidate of cases) {
      expect(() => createWorldPackageValidationSubjectV1(candidate)).toThrow(
        "WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID",
      );
    }
  });

  it("rejects a Plan that was not compiled from the supplied Normalized IR", () => {
    const { validationInput } = createFixture();
    const executionPlan = structuredClone(validationInput.executionPlan);
    const firstObject = executionPlan.objects[0];
    if (firstObject === undefined) throw new Error("fixture must contain an object");
    (firstObject.transform.positionMetersXYZ as unknown as number[])[0] = 777;

    expect(() => createWorldPackageValidationSubjectV1({
      ...validationInput,
      executionPlan,
    })).toThrow("WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID");
  });

  it("rejects an internally valid Receipt with a resource outside the actual IR closure", () => {
    const { validationInput } = createFixture();
    const receipt = validationInput.worldPackageBuildReceipt;
    const extraBytes = new Uint8Array([11, 22, 33]);
    const extraHash = sha256Bytes(extraBytes) as WorldPackageSha256HashV1;
    const extraResource = {
      resourceRef: "worldkit://subject-asset/unbound.extra@1",
      packagePath: "resources/subject-assets/unbound.extra.glb",
      mediaType: "model/gltf-binary",
      sizeBytes: extraBytes.byteLength,
      contentHash: extraHash,
    } as const;
    const forged = resignReceipt(
      receipt,
      {
        ...receipt.manifest,
        resources: [...receipt.manifest.resources, extraResource],
      },
      [
        ...receipt.fileIntegrityEntries,
        {
          path: extraResource.packagePath,
          mediaType: extraResource.mediaType,
          sizeBytes: extraResource.sizeBytes,
          sha256: extraResource.contentHash,
        },
      ],
    );

    expect(assertWorldPackageBuildReceiptV1(forged)).toEqual(forged);
    expect(() => createWorldPackageValidationSubjectV1({
      ...validationInput,
      worldPackageBuildReceipt: forged,
    })).toThrow("WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID");
  });

  it("rejects an internally valid Root with a core JSON size that differs from the actual artifact", () => {
    const { validationInput } = createFixture();
    const receipt = validationInput.worldPackageBuildReceipt;
    const entries = receipt.fileIntegrityEntries.map((entry) =>
      entry.path === "world.normalized.json"
        ? { ...entry, sizeBytes: entry.sizeBytes + 1 }
        : entry
    );
    const forged = resignReceipt(receipt, receipt.manifest, entries);

    expect(assertWorldPackageBuildReceiptV1(forged)).toEqual(forged);
    expect(() => createWorldPackageValidationSubjectV1({
      ...validationInput,
      worldPackageBuildReceipt: forged,
    })).toThrow("WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID");
  });

  it("rejects an internally valid Root whose Authoring file hash and size differ from the actual V4 spec", () => {
    const { validationInput } = createFixture();
    const receipt = validationInput.worldPackageBuildReceipt;
    const unrelatedBytes = canonicalJsonBytes({ unrelated: true });
    const entries = receipt.fileIntegrityEntries.map((entry) =>
      entry.path === "authoring-spec.json"
        ? {
            ...entry,
            sizeBytes: unrelatedBytes.byteLength,
            sha256: sha256Bytes(unrelatedBytes) as WorldPackageSha256HashV1,
          }
        : entry
    );
    const forged = resignReceipt(receipt, receipt.manifest, entries);

    expect(assertWorldPackageBuildReceiptV1(forged)).toEqual(forged);
    expect(() => createWorldPackageValidationSubjectV1({
      ...validationInput,
      worldPackageBuildReceipt: forged,
    })).toThrow("WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID");
  });

  it("rejects unknown fields and raw hash bags", () => {
    const { validationInput } = createFixture();
    expect(() => createWorldPackageValidationSubjectV1({
      ...validationInput,
      worldPackageRootHash: validationInput.worldPackageBuildReceipt.worldPackageRootHash,
    } as unknown as CreateWorldPackageValidationSubjectInputV1)).toThrow(
      "WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID",
    );
    expect(() => createWorldPackageValidationSubjectV1({
      kind: "world-package",
      worldPackageRootHash: validationInput.worldPackageBuildReceipt.worldPackageRootHash,
      authoringSpecHash: validationInput.worldPackageBuildReceipt.manifest.authoringSpecHash,
      normalizedWorldIrHash:
        validationInput.worldPackageBuildReceipt.manifest.normalizedWorldIrHash,
      executionPlanHash: validationInput.worldPackageBuildReceipt.manifest.executionPlanHash,
      resourceLockHash: validationInput.worldPackageBuildReceipt.manifest.resourceLockHash,
      layoutSolveReportHash:
        validationInput.worldPackageBuildReceipt.manifest.layoutSolveReportHash,
    } as unknown as CreateWorldPackageValidationSubjectInputV1)).toThrow(
      "WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID",
    );
  });

  it("rejects all-zero child identities before they can become a subject", () => {
    const { validationInput } = createFixture();
    const zeroHash = `sha256:${"0".repeat(64)}` as const;

    expect(() => createWorldPackageValidationSubjectV1({
      ...validationInput,
      executionPlan: {
        ...validationInput.executionPlan,
        resourceLockHash: zeroHash,
      },
    })).toThrow("WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID");
  });

  it("rejects accessors and symbols without invoking hidden state", () => {
    const source = createFixture().validationInput;
    const accessorInput: CreateWorldPackageValidationSubjectInputV1 = {
      ...source,
      executionPlan: structuredClone(source.executionPlan),
    };
    let readCount = 0;
    Object.defineProperty(accessorInput.executionPlan, "initialControlledEntityId", {
      configurable: true,
      enumerable: true,
      get: () => {
        readCount += 1;
        return "player";
      },
    });
    expect(() => createWorldPackageValidationSubjectV1(accessorInput)).toThrow(
      "WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_ACCESSOR_FORBIDDEN",
    );
    expect(readCount).toBe(0);

    const symbolInput = createFixture().validationInput as
      CreateWorldPackageValidationSubjectInputV1 & { [key: symbol]: string };
    symbolInput[Symbol("hidden")] = "state";
    expect(() => createWorldPackageValidationSubjectV1(symbolInput)).toThrow(
      "WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_SYMBOL_KEY_FORBIDDEN",
    );
  });

  it("rejects SharedArrayBuffer-backed and detached byte views before cloning", () => {
    const sharedInput = createFixture().validationInput as
      CreateWorldPackageValidationSubjectInputV1 & { hiddenBytes: Uint8Array };
    sharedInput.hiddenBytes = new Uint8Array(new SharedArrayBuffer(8));
    expect(() => createWorldPackageValidationSubjectV1(sharedInput)).toThrow(
      "WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_SHARED_MEMORY_FORBIDDEN",
    );

    const detachedInput = createFixture().validationInput as
      CreateWorldPackageValidationSubjectInputV1 & { hiddenBytes: Uint8Array };
    const bytes = new Uint8Array(8);
    structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
    detachedInput.hiddenBytes = bytes;
    expect(() => createWorldPackageValidationSubjectV1(detachedInput)).toThrow(
      "WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_DETACHED_BUFFER_FORBIDDEN",
    );
  });
});
