import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import authoringSpecV2Schema from "./authoring-spec-v2.schema.json";
import authoringSpecV3Schema from "./authoring-spec-v3.schema.json";
import subjectDefinitionV1Schema from "./subject-definition-v1.schema.json";
import type { AuthoringDiagnostic, AuthoringResult } from "./types.js";
import type { AuthoringSpecV3 } from "./types-v3.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
});
addFormats(ajv);
ajv.addFormat("worldkit-resource-ref", {
  type: "string",
  validate: (value: string) =>
    /^(?:worldkit|package|asset):\/\/[a-z0-9][a-z0-9./_-]*(?:@[1-9][0-9]*)?$/.test(value),
});
ajv.addFormat("subject-definition-ref", {
  type: "string",
  validate: (value: string) =>
    /^(?:worldkit|package):\/\/subject-definition\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
      value,
    ),
});
ajv.addFormat("capability-ref", {
  type: "string",
  validate: (value: string) =>
    /^worldkit:\/\/capability\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(value),
});
ajv.addFormat("physics-body-profile-ref", {
  type: "string",
  validate: (value: string) =>
    /^worldkit:\/\/physics-body-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
      value,
    ),
});
ajv.addFormat("locomotion-profile-ref", {
  type: "string",
  validate: (value: string) =>
    /^worldkit:\/\/locomotion-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
      value,
    ),
});
ajv.addFormat("collider-derivation-profile-ref", {
  type: "string",
  validate: (value: string) =>
    /^worldkit:\/\/collider-derivation-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
      value,
    ),
});
ajv.addFormat("package-prototype-ref", {
  type: "string",
  validate: (value: string) =>
    /^package:\/\/prototype\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(value),
});
ajv.addFormat("layout-solver-profile-ref", {
  type: "string",
  validate: (value: string) =>
    /^worldkit:\/\/layout-solver-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
      value,
    ),
});

ajv.addSchema(subjectDefinitionV1Schema);
ajv.addSchema(authoringSpecV2Schema);
const validateCanonicalAuthoringSpecV3 = ajv.compile<AuthoringSpecV3>(
  authoringSpecV3Schema,
);

function pointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function diagnosticFor(error: ErrorObject): AuthoringDiagnostic {
  const missingOrAdditionalProperty =
    error.keyword === "required"
      ? (error.params.missingProperty as string | undefined)
      : error.keyword === "additionalProperties"
        ? (error.params.additionalProperty as string | undefined)
        : undefined;
  return {
    severity: "error",
    code: "AUTHORING_SCHEMA_INVALID",
    instancePath:
      missingOrAdditionalProperty === undefined
        ? error.instancePath
        : `${error.instancePath}/${pointerSegment(missingOrAdditionalProperty)}`,
    message: error.message ?? "AuthoringSpec does not match the canonical schema.",
    details: {
      keyword: error.keyword,
      schemaPath: error.schemaPath,
      params: error.params,
    },
  };
}

function duplicateIdDiagnostics(spec: AuthoringSpecV3): AuthoringDiagnostic[] {
  const diagnostics: AuthoringDiagnostic[] = [];
  const collections = [
    ["/nodes", spec.nodes],
    ["/spatial/regions", spec.spatial.regions],
    ["/spatial/routes", spec.spatial.routes],
    ["/spatial/screenRegions", spec.spatial.screenRegions],
    ["/constraints/placements", spec.constraints.placements],
  ] as const;

  for (const [instancePath, rows] of collections) {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      if (seen.has(row.id)) {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_DUPLICATE_ID",
          instancePath: `${instancePath}/${index}/id`,
          message: `Duplicate id '${row.id}' is not allowed in this collection.`,
          details: { id: row.id },
        });
      }
      seen.add(row.id);
    });
  }
  return diagnostics;
}

function orderedRangeDiagnostics(spec: AuthoringSpecV3): AuthoringDiagnostic[] {
  const diagnostics: AuthoringDiagnostic[] = [];
  spec.spatial.regions.forEach((region, index) => {
    if (
      region.minimumHeightMeters !== undefined &&
      region.maximumHeightMeters !== undefined &&
      region.minimumHeightMeters > region.maximumHeightMeters
    ) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_SPATIAL_RANGE_INVALID",
        instancePath: `/spatial/regions/${index}/maximumHeightMeters`,
        message: "maximumHeightMeters must be greater than or equal to minimumHeightMeters.",
      });
    }
  });
  spec.spatial.screenRegions.forEach((region, index) => {
    if (
      region.minimumUv[0] >= region.maximumUv[0] ||
      region.minimumUv[1] >= region.maximumUv[1]
    ) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_SPATIAL_RANGE_INVALID",
        instancePath: `/spatial/screenRegions/${index}/maximumUv`,
        message: "maximumUv must be greater than minimumUv on both axes.",
      });
    }
  });
  spec.constraints.placements.forEach((constraint, index) => {
    if (
      constraint.kind === "distance-range" &&
      constraint.minimumDistanceMeters > constraint.maximumDistanceMeters
    ) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_SPATIAL_RANGE_INVALID",
        instancePath: `/constraints/placements/${index}/maximumDistanceMeters`,
        message: "maximumDistanceMeters must be greater than or equal to minimumDistanceMeters.",
      });
    }
  });
  return diagnostics;
}

export function validateAuthoringSpecV3(
  value: unknown,
): AuthoringResult<AuthoringSpecV3> {
  if (!validateCanonicalAuthoringSpecV3(value)) {
    return {
      ok: false,
      diagnostics: (validateCanonicalAuthoringSpecV3.errors ?? []).map(diagnosticFor),
    };
  }

  const diagnostics = [
    ...duplicateIdDiagnostics(value),
    ...orderedRangeDiagnostics(value),
  ];
  return diagnostics.length === 0
    ? { ok: true, value, diagnostics: [] }
    : { ok: false, diagnostics };
}
