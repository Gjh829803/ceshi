import {
  normalizeAuthoringSpecV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import {
  createWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { createWorldPackageFixtureContextV1 } from "@whitebox-world/world-package/testing";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import basicWorldDocument from "../../../examples/authoring/basic-world.json";
import { createWorldPackageValidationSubjectV1 } from "./index.js";

function authoringFixture(): AuthoringSpecV4 {
  const validated = validateAuthoringSpecV4(basicWorldDocument);
  if (!validated.ok || isNil(validated.value)) {
    throw new Error("fixture AuthoringSpecV4 is invalid");
  }
  return validated.value;
}

function buildClosure() {
  const authoringSpec = authoringFixture();
  const normalized = normalizeAuthoringSpecV4(authoringSpec);
  if (
    !normalized.ok ||
    isNil(normalized.value) ||
    isNil(normalized.normalizedWorldIrHash) ||
    isNil(normalized.layoutSolveReport) ||
    isNil(normalized.layoutSolveReportHash)
  ) {
    throw new Error("fixture normalization failed");
  }
  const gameplayBootstrap = createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: `${authoringSpec.id}.gameplay`,
    version: 1,
    resourceRef: `worldkit://gameplay-bootstrap/${authoringSpec.id}@1`,
    entityDescriptors: normalized.value.nodes
      .filter((node) => node.kind === "subject")
      .map((node) => {
        const definition = normalized.value!.resources.subjectDefinitions.find(
          (candidate) =>
            candidate.subjectDefinitionRef === node.subjectDefinitionRef,
        );
        if (isNil(definition)) throw new Error("fixture Subject Definition missing");
        return {
          id: node.id,
          entityDefinitionRef: node.subjectDefinitionRef,
          capabilityRefs: definition.capabilityRefs,
        };
      }),
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
    initialRelationshipStates: [],
  });
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok || isNil(compiled.canonicalSceneExecutionPlan)) {
    throw new Error("fixture compilation failed");
  }
  const layoutSolveResult = {
    status: normalized.layoutSolveReport.status,
    report: normalized.layoutSolveReport,
    layoutSolveReportHash: normalized.layoutSolveReportHash,
  } as const;
  return {
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult,
    executionPlan: compiled.canonicalSceneExecutionPlan,
    gameplayBootstrap,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
  };
}

function verifiedFixture() {
  const closure = buildClosure();
  const directory = createWorldPackageV1({
    ...createWorldPackageFixtureContextV1({
      packageId: `${closure.authoringSpec.id}.package`,
      title: "Validation Subject Fixture",
    }),
    ...closure,
    resourceArtifacts: [],
  });
  return { closure, verified: verifyWorldPackageDirectoryV1(directory) };
}

describe("WorldPackageValidationSubjectV1 verified boundary", () => {
  it("projects the exact Validation identity from one verified package", () => {
    const { verified } = verifiedFixture();
    const subject = createWorldPackageValidationSubjectV1(verified);

    expect(subject).toEqual({
      kind: "world-package",
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      authoringSpecHash: verified.receipt.manifest.authoringSpecHash,
      normalizedWorldIrHash: verified.receipt.manifest.normalizedWorldIrHash,
      worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
      resourceLockHash: verified.receipt.manifest.registryLockHash,
      layoutSolveReportHash: verified.receipt.manifest.layoutSolveReportHash,
    });
    expect(createWorldPackageValidationSubjectV1(verified)).toEqual(subject);
    expect(subject).not.toHaveProperty(["execution", "Plan", "Hash"].join(""));
  });

  it("rejects caller-forged verified Plan and Registry closure fields", () => {
    const { verified } = verifiedFixture();
    const forgedPlan = {
      ...verified,
      executionPlan: {
        ...verified.executionPlan,
        seed: verified.executionPlan.seed + 1,
      },
    };
    const forgedRegistryLock = {
      ...verified,
      registryLock: verified.registryLock.slice(1),
    };
    for (const candidate of [forgedPlan, forgedRegistryLock]) {
      expect(() => createWorldPackageValidationSubjectV1(candidate as never))
        .toThrow("WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID");
    }
  });
});
