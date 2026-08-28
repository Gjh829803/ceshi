import type { NormalizedWorldIRV4 } from "@whitebox-world/authoring";
import canonicalAuthoringSchema from "@whitebox-world/authoring/schema";
import { hashCanonicalAuthoringSchemaV1 } from "@whitebox-world/authoring-edit";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
  createWorldPackageV1,
  type ResolvedWorldPackageResourceArtifactV1,
  type WorldPackageBuildContextV1,
  type WorldPackageDirectoryV1,
  type WorldPackageLicenseDocumentInputV1,
} from "@whitebox-world/world-package";
import { isEmpty, isNil } from "lodash-es";

import {
  resolveWorldPackageResourceArtifactsV1,
  type ResolveWorldPackageResourceBytesOptionsV1,
} from "./world-package-resource-resolver";
import type { WorldkitRoutePipelineSuccess } from "./worldkit-pipeline";

const CONSTRAINED_JSON_PROFILE_REF =
  "worldkit://ai-schema-projection-profile/constrained-json@1";

const PROJECT_OWNED_LICENSE = Object.freeze({
  id: "project-owned",
  spdxLicenseExpression: "LicenseRef-Project-Owned",
  path: "LICENSES/project-owned.txt",
  text: "Project-owned WorldKit package content. Redistribution allowed.\n",
}) satisfies WorldPackageLicenseDocumentInputV1;

const LOOPIT_PRIVATE_LICENSE = Object.freeze({
  id: "loopit-private",
  spdxLicenseExpression: "LicenseRef-Loopit-Company-Private",
  path: "LICENSES/loopit-private.txt",
  text: "Loopit company-private asset license. No external redistribution.\n",
}) satisfies WorldPackageLicenseDocumentInputV1;

const LICENSE_BY_SPDX_EXPRESSION = new Map<
  string,
  WorldPackageLicenseDocumentInputV1
>([
  [PROJECT_OWNED_LICENSE.spdxLicenseExpression, PROJECT_OWNED_LICENSE],
  [LOOPIT_PRIVATE_LICENSE.spdxLicenseExpression, LOOPIT_PRIVATE_LICENSE],
]);

export async function resolveTrustedWorldPackageResourceArtifactsV1(
  normalizedWorldIr: NormalizedWorldIRV4,
  options: ResolveWorldPackageResourceBytesOptionsV1 = {},
): Promise<readonly ResolvedWorldPackageResourceArtifactV1[]> {
  const subjectAssetManifests = normalizedWorldIr.resources.subjectAssets.map(
    (asset) => {
      const manifest = builtInSubjectResourceRegistry.resolveSubjectAsset(
        asset.subjectAssetRef,
      );
      if (isNil(manifest)) {
        throw new Error(
          `WORLD_PACKAGE_SUBJECT_ASSET_MANIFEST_MISSING: ${asset.subjectAssetRef}`,
        );
      }
      return manifest;
    },
  );
  const licenseDocuments = [...new Set(subjectAssetManifests.map(
    (manifest) => manifest.provenance.licenseSpdxId,
  ))].map((spdxLicenseExpression) => {
    const document = LICENSE_BY_SPDX_EXPRESSION.get(spdxLicenseExpression);
    if (isNil(document)) {
      throw new Error(
        `WORLD_PACKAGE_LICENSE_DOCUMENT_MISSING: ${spdxLicenseExpression}`,
      );
    }
    return {
      id: document.id,
      spdxLicenseExpression: document.spdxLicenseExpression,
    };
  });
  return resolveWorldPackageResourceArtifactsV1(normalizedWorldIr, {
    ...options,
    subjectAssetManifests,
    licenseDocuments,
  });
}

export function createTrustedWorldPackageBuildContextV1(input: {
  readonly title: string;
  readonly resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV1[];
}): WorldPackageBuildContextV1 {
  const projectionProfile =
    builtInSubjectResourceRegistry.resolveAiSchemaProjectionProfile(
      CONSTRAINED_JSON_PROFILE_REF,
    );
  if (isNil(projectionProfile)) {
    throw new Error("WORLD_PACKAGE_AI_SCHEMA_PROFILE_MISSING");
  }
  const usedSpdxExpressions = new Set([
    PROJECT_OWNED_LICENSE.spdxLicenseExpression,
    ...input.resourceArtifacts.map((artifact) => artifact.licenseSpdxExpression),
  ]);
  const licenseDocuments = [...usedSpdxExpressions].map(
    (spdxLicenseExpression) => {
      const document = LICENSE_BY_SPDX_EXPRESSION.get(spdxLicenseExpression);
      if (isNil(document)) {
        throw new Error(
          `WORLD_PACKAGE_LICENSE_DOCUMENT_MISSING: ${spdxLicenseExpression}`,
        );
      }
      return document;
    },
  ).sort((left, right) => left.id.localeCompare(right.id));
  if (isEmpty(licenseDocuments)) {
    throw new Error("WORLD_PACKAGE_LICENSE_DOCUMENT_MISSING");
  }
  const distributionPolicy = input.resourceArtifacts.some(
    (artifact) => artifact.redistributionPolicy !== "allowed",
  )
    ? "internal-only"
    : "redistributable";
  return Object.freeze({
    title: input.title,
    sdkVersion: "0.0.0",
    distributionPolicy,
    canonicalAuthoringSchemaHash:
      hashCanonicalAuthoringSchemaV1(canonicalAuthoringSchema),
    aiSchemaProjectionProfile: Object.freeze({
      resourceRef: projectionProfile.resourceRef,
      contentHash: projectionProfile.contentHash as `sha256:${string}`,
    }),
    hostCompatibility: BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
    generatedResourceProvenance: Object.freeze({
      licenseDocumentId: PROJECT_OWNED_LICENSE.id,
      licenseSpdxExpression: PROJECT_OWNED_LICENSE.spdxLicenseExpression,
      redistributionPolicy: "allowed",
      author: "Agent Whitebox World SDK",
    }),
    licenseDocuments: Object.freeze(licenseDocuments),
    noticeText: `${input.title}\n${licenseDocuments.map((document) =>
      `See ${document.path}.`
    ).join("\n")}\n`,
    includeAuthoringSpec: true,
  });
}

export async function createTrustedCanonicalWorldPackageV1(
  pipeline: WorldkitRoutePipelineSuccess,
): Promise<WorldPackageDirectoryV1> {
  const resourceArtifacts = await resolveTrustedWorldPackageResourceArtifactsV1(
    pipeline.normalizedWorldIr,
  );
  return createWorldPackageV1({
    packageId: `${pipeline.authoringSpec.id}.world-package`,
    ...createTrustedWorldPackageBuildContextV1({
      title: `${pipeline.authoringSpec.id} WorldPackage`,
      resourceArtifacts,
    }),
    authoringSpec: pipeline.authoringSpec,
    normalizedWorldIr: pipeline.normalizedWorldIr,
    layoutSolveResult: Object.freeze({
      status: pipeline.layoutSolveReport.status,
      report: pipeline.layoutSolveReport,
      layoutSolveReportHash: pipeline.layoutSolveReportHash,
    }),
    executionPlan: pipeline.executionPlan,
    gameplayBootstrap: pipeline.gameplayBootstrap,
    worldRuntimeBootstrap: pipeline.worldRuntimeBootstrap,
    resourceArtifacts,
  });
}
