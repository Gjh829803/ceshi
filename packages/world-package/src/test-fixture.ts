import { normalizeAuthoringSpecV4, validateAuthoringSpecV4, type AuthoringSpecV4 } from "@whitebox-world/authoring";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import { createGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { isNil } from "lodash-es";

import basicWorldDocument from "../../../examples/authoring/basic-world.json";
import { BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1 } from "./babylon-web-host-profile.js";
import type { CreateWorldPackageV1Input } from "./package-build.js";

export function createWorldPackageTestInputV1(
  overrides: Partial<CreateWorldPackageV1Input> = {},
): CreateWorldPackageV1Input {
  const validated = validateAuthoringSpecV4(basicWorldDocument);
  if (!validated.ok || isNil(validated.value)) throw new Error("test AuthoringSpec invalid");
  const authoringSpec: AuthoringSpecV4 = validated.value;
  const normalized = normalizeAuthoringSpecV4(authoringSpec);
  if (!normalized.ok || isNil(normalized.value) || isNil(normalized.normalizedWorldIrHash) || isNil(normalized.layoutSolveReport) || isNil(normalized.layoutSolveReportHash)) {
    throw new Error("test normalization failed");
  }
  const gameplayBootstrap = createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: `${authoringSpec.id}.gameplay`,
    version: 1,
    resourceRef: `worldkit://gameplay-bootstrap/${authoringSpec.id}@1`,
    entityDescriptors: normalized.value.nodes.filter((node) => node.kind === "subject").map((node) => {
      const definition = normalized.value!.resources.subjectDefinitions.find((candidate) => candidate.subjectDefinitionRef === node.subjectDefinitionRef);
      if (isNil(definition)) throw new Error("test Subject Definition missing");
      return { id: node.id, entityDefinitionRef: node.subjectDefinitionRef, capabilityRefs: definition.capabilityRefs };
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
    worldRuntimeBootstrapRef: `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok || isNil(compiled.canonicalSceneExecutionPlan) || isNil(compiled.worldRuntimeBootstrap)) {
    throw new Error("test compilation failed");
  }
  const base: CreateWorldPackageV1Input = {
    packageId: `${authoringSpec.id}.package`,
    title: "Basic World",
    sdkVersion: "0.0.0",
    distributionPolicy: "redistributable",
    canonicalAuthoringSchemaHash: `sha256:${"a".repeat(64)}`,
    aiSchemaProjectionProfile: {
      resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
      contentHash: `sha256:${"b".repeat(64)}`,
    },
    hostCompatibility: BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
    authoringSpec,
    normalizedWorldIr: normalized.value,
    layoutSolveResult: {
      status: normalized.layoutSolveReport.status,
      report: normalized.layoutSolveReport,
      layoutSolveReportHash: normalized.layoutSolveReportHash,
    },
    executionPlan: compiled.canonicalSceneExecutionPlan,
    gameplayBootstrap,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
    resourceArtifacts: [],
    generatedResourceProvenance: {
      licenseDocumentId: "project-owned",
      licenseSpdxExpression: "LicenseRef-Project-Owned",
      redistributionPolicy: "allowed",
      author: "Agent Whitebox World SDK Test Fixture",
    },
    licenseDocuments: [{
      id: "project-owned",
      spdxLicenseExpression: "LicenseRef-Project-Owned",
      path: "LICENSES/project-owned.txt",
      text: "Project-owned test fixture. Redistribution allowed.\n",
    }],
    noticeText: "Basic World\nSee LICENSES/project-owned.txt.\n",
    includeAuthoringSpec: true,
  };
  return { ...base, ...overrides };
}
