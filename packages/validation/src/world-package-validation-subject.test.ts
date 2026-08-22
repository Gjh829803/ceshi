import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import type { LayoutSolveResultV1 } from "@whitebox-world/layout-solver";
import {
  createWorldPackageBuildReceiptV1,
  type CreateWorldPackageBuildReceiptInputV1,
} from "@whitebox-world/world-package";
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
    constraints: {
      placements: source.constraints.placements,
      connectivity: [],
    },
  };
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
  const packageInput: CreateWorldPackageBuildReceiptInputV1 = {
    packageId: `${authoringSpec.id}.package`,
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult,
    executionPlan: compiled.executionPlan,
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
    },
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

  it("rejects unknown fields, raw hash bags, transitional identities, and V3 artifacts", () => {
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
    for (const invalidReceipt of [
      {
        kind: "worldkit-transitional-world-package-identity",
        schemaVersion: 1,
        worldPackageRootHash: validationInput.worldPackageBuildReceipt.worldPackageRootHash,
      },
      {
        kind: "worldkit-build-artifact",
        schemaVersion: 3,
        normalizedWorldIrHash:
          validationInput.worldPackageBuildReceipt.manifest.normalizedWorldIrHash,
        executionPlanHash:
          validationInput.worldPackageBuildReceipt.manifest.executionPlanHash,
      },
    ]) {
      expect(() => createWorldPackageValidationSubjectV1({
        ...validationInput,
        worldPackageBuildReceipt: invalidReceipt,
      } as unknown as CreateWorldPackageValidationSubjectInputV1)).toThrow(
        "WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID",
      );
    }
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
    const accessorInput = createFixture().validationInput;
    let readCount = 0;
    Object.defineProperty(accessorInput.executionPlan, "controlledEntityId", {
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
