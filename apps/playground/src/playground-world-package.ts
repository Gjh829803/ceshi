import canonicalAuthoringSchema from "@whitebox-world/authoring/schema";
import { hashCanonicalAuthoringSchemaV1 } from "@whitebox-world/authoring-edit";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
  type ResolvedWorldPackageResourceArtifactV1,
  type WorldPackageBuildContextV1,
  type WorldPackageLicenseDocumentInputV1,
} from "@whitebox-world/world-package";
import { isNil } from "lodash-es";
import gpl3LicenseText from
  "../../../assets/licenses/kart-control-lab-stk-kart/GPL-3.0.txt?raw";

const CONSTRAINED_JSON_PROFILE_REF =
  "worldkit://ai-schema-projection-profile/constrained-json@1";

const LICENSE_BY_SPDX_EXPRESSION = new Map<string, WorldPackageLicenseDocumentInputV1>([
  ["LicenseRef-Project-Owned", Object.freeze({
    id: "project-owned",
    spdxLicenseExpression: "LicenseRef-Project-Owned",
    path: "LICENSES/project-owned.txt",
    text: "Project-owned WorldKit package content. Redistribution allowed.\n",
  })],
  ["LicenseRef-Loopit-Company-Private", Object.freeze({
    id: "loopit-private",
    spdxLicenseExpression: "LicenseRef-Loopit-Company-Private",
    path: "LICENSES/loopit-private.txt",
    text: "Loopit company-private asset license. No external redistribution.\n",
  })],
  ["GPL-3.0-or-later", Object.freeze({
    id: "gpl-3.0-or-later",
    spdxLicenseExpression: "GPL-3.0-or-later",
    path: "LICENSES/gpl-3.0-or-later.txt",
    text: gpl3LicenseText,
  })],
]);

export function createPlaygroundWorldPackageBuildContextV1(input: {
  readonly title: string;
  readonly resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV1[];
  readonly includeAuthoringSpec: boolean;
}): WorldPackageBuildContextV1 {
  const projectionProfile =
    builtInSubjectResourceRegistry.resolveAiSchemaProjectionProfile(
      CONSTRAINED_JSON_PROFILE_REF,
    );
  if (isNil(projectionProfile)) {
    throw new Error("WORLD_PACKAGE_AI_SCHEMA_PROFILE_MISSING");
  }
  const usedSpdxExpressions = new Set([
    "LicenseRef-Project-Owned",
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
      licenseDocumentId: "project-owned",
      licenseSpdxExpression: "LicenseRef-Project-Owned",
      redistributionPolicy: "allowed",
      author: "Agent Whitebox World SDK",
    }),
    licenseDocuments: Object.freeze(licenseDocuments),
    noticeText: `${input.title}\n${licenseDocuments.map((document) =>
      `See ${document.path}.`
    ).join("\n")}\n`,
    includeAuthoringSpec: input.includeAuthoringSpec,
  });
}
