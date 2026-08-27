import type { NormalizedWorldIRV4 } from "@whitebox-world/authoring";
import canonicalAuthoringSchema from "@whitebox-world/authoring/schema";
import { hashCanonicalAuthoringSchemaV1 } from "@whitebox-world/authoring-edit";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V2,
  type ResolvedWorldPackageResourceArtifactV2,
  type WorldPackageBuildContextV2,
  type WorldPackageLicenseDocumentInputV2,
} from "@whitebox-world/world-package";
import { isEmpty, isNil } from "lodash-es";

import {
  resolveWorldPackageResourceArtifactsV2,
  type ResolveWorldPackageResourceArtifactsOptionsV1,
} from "./world-package-resource-resolver";

const CONSTRAINED_JSON_PROFILE_REF =
  "worldkit://ai-schema-projection-profile/constrained-json@1";

const PROJECT_OWNED_LICENSE = Object.freeze({
  id: "project-owned",
  spdxLicenseExpression: "LicenseRef-Project-Owned",
  path: "LICENSES/project-owned.txt",
  text: "Project-owned WorldKit package content. Redistribution allowed.\n",
}) satisfies WorldPackageLicenseDocumentInputV2;

const LOOPIT_PRIVATE_LICENSE = Object.freeze({
  id: "loopit-private",
  spdxLicenseExpression: "LicenseRef-Loopit-Company-Private",
  path: "LICENSES/loopit-private.txt",
  text: "Loopit company-private asset license. No external redistribution.\n",
}) satisfies WorldPackageLicenseDocumentInputV2;

const LICENSE_BY_SPDX_EXPRESSION = new Map<
  string,
  WorldPackageLicenseDocumentInputV2
>([
  [PROJECT_OWNED_LICENSE.spdxLicenseExpression, PROJECT_OWNED_LICENSE],
  [LOOPIT_PRIVATE_LICENSE.spdxLicenseExpression, LOOPIT_PRIVATE_LICENSE],
]);

export async function resolveTrustedWorldPackageResourceArtifactsV2(
  normalizedWorldIr: NormalizedWorldIRV4,
  options: ResolveWorldPackageResourceArtifactsOptionsV1 = {},
): Promise<readonly ResolvedWorldPackageResourceArtifactV2[]> {
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
  return resolveWorldPackageResourceArtifactsV2(normalizedWorldIr, {
    ...options,
    subjectAssetManifests,
    licenseDocuments,
  });
}

export function createTrustedWorldPackageBuildContextV2(input: {
  readonly title: string;
  readonly resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV2[];
}): WorldPackageBuildContextV2 {
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
    hostCompatibility: BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V2,
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
