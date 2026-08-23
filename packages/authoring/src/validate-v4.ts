import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  validateSimplePolygonXZV1,
  validateTraversalAreaComplexityV1,
} from "@whitebox-world/terrain-surface";
import { isEmpty, isNil } from "lodash-es";

import authoringSpecV4Schema from "./authoring-spec-v4.schema.json";
import subjectDefinitionV1Schema from "./subject-definition-v1.schema.json";
import type { AuthoringDiagnostic, AuthoringResult } from "./types.js";
import type { AuthoringSpecV4 } from "./types-v4.js";

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
const validateCanonicalAuthoringSpecV4 = ajv.compile<AuthoringSpecV4>(
  authoringSpecV4Schema,
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
    code:
      error.keyword === "maxItems" &&
        (
          error.instancePath === "/spatial/traversalAreas" ||
          /^\/spatial\/traversalAreas\/[0-9]+\/pointsMetersXZ$/.test(
            error.instancePath,
          )
        )
        ? "AUTHORING_SPATIAL_BUDGET_EXCEEDED"
        : "AUTHORING_SCHEMA_INVALID",
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

function duplicateIdDiagnostics(spec: AuthoringSpecV4): AuthoringDiagnostic[] {
  const diagnostics: AuthoringDiagnostic[] = [];
  const collections = [
    ["/nodes", spec.nodes],
    ["/spatial/regions", spec.spatial.regions],
    ["/spatial/routes", spec.spatial.routes],
    ["/spatial/traversalAreas", spec.spatial.traversalAreas],
    ["/spatial/screenRegions", spec.spatial.screenRegions],
    ["/constraints/placements", spec.constraints.placements],
    ["/constraints/connectivity", spec.constraints.connectivity],
  ] as const;

  for (const [instancePath, rows] of collections) {
    if (isEmpty(rows)) continue;
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

function orderedRangeDiagnostics(spec: AuthoringSpecV4): AuthoringDiagnostic[] {
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

function requireNodeKind(
  nodes: ReadonlyMap<string, AuthoringSpecV4["nodes"][number]>,
  id: string,
  kind: AuthoringSpecV4["nodes"][number]["kind"],
  instancePath: string,
  diagnostics: AuthoringDiagnostic[],
): void {
  const node = nodes.get(id);
  if (isNil(node)) {
    diagnostics.push({
      severity: "error",
      code: "AUTHORING_REFERENCE_NOT_FOUND",
      instancePath,
      message: `Node '${id}' does not exist.`,
      details: { id },
    });
    return;
  }
  if (node.kind !== kind) {
    diagnostics.push({
      severity: "error",
      code: "AUTHORING_REFERENCE_KIND_MISMATCH",
      instancePath,
      message: `Node '${id}' is '${node.kind}', expected '${kind}'.`,
      details: { id, actualKind: node.kind, expectedKind: kind },
    });
  }
}

function connectivityReferenceDiagnostics(spec: AuthoringSpecV4): AuthoringDiagnostic[] {
  const diagnostics: AuthoringDiagnostic[] = [];
  const connectivity = spec.constraints.connectivity;
  if (isEmpty(connectivity)) return diagnostics;

  const nodeById = new Map(spec.nodes.map((node) => [node.id, node] as const));
  const routeIds = new Set(spec.spatial.routes.map((route) => route.id));

  connectivity.forEach((constraint, index) => {
    const base = `/constraints/connectivity/${index}`;
    requireNodeKind(nodeById, constraint.traversingEntityId, "subject", `${base}/traversingEntityId`, diagnostics);
    requireNodeKind(nodeById, constraint.startAnchorEntityId, "anchor", `${base}/startAnchorEntityId`, diagnostics);
    requireNodeKind(
      nodeById,
      constraint.destinationAnchorEntityId,
      "anchor",
      `${base}/destinationAnchorEntityId`,
      diagnostics,
    );
    if (!routeIds.has(constraint.routeId)) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_REFERENCE_NOT_FOUND",
        instancePath: `${base}/routeId`,
        message: `Route '${constraint.routeId}' does not exist.`,
        details: { routeId: constraint.routeId },
      });
    }
  });
  return diagnostics;
}

function traversalAreaDiagnostics(spec: AuthoringSpecV4): AuthoringDiagnostic[] {
  const diagnostics: AuthoringDiagnostic[] = [];
  const nodeById = new Map(spec.nodes.map((node) => [node.id, node] as const));
  const complexity = validateTraversalAreaComplexityV1({
    pointCountsByArea: spec.spatial.traversalAreas.map(
      (area) => area.pointsMetersXZ.length,
    ),
  });
  if (!complexity.ok) {
    diagnostics.push({
      severity: "error",
      code: "AUTHORING_SPATIAL_BUDGET_EXCEEDED",
      instancePath: isNil(complexity.areaIndex)
        ? "/spatial/traversalAreas"
        : `/spatial/traversalAreas/${complexity.areaIndex}/pointsMetersXZ`,
      message: `Traversal Area complexity exceeds the frozen budget (${complexity.issueCode}: ${complexity.actualCount} > ${complexity.maximumCount}).`,
    });
  }
  spec.spatial.traversalAreas.forEach((area, index) => {
    const base = `/spatial/traversalAreas/${index}`;
    requireNodeKind(
      nodeById,
      area.surfaceEntityId,
      "terrain",
      `${base}/surfaceEntityId`,
      diagnostics,
    );
    const polygonValidation = validateSimplePolygonXZV1(area.pointsMetersXZ);
    if (!polygonValidation.ok) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_SPATIAL_RANGE_INVALID",
        instancePath: `${base}/pointsMetersXZ`,
        message: `Traversal Area polygon must be simple (${polygonValidation.issueCode}).`,
      });
    }
  });
  return diagnostics;
}

export function validateAuthoringSpecV4(
  value: unknown,
): AuthoringResult<AuthoringSpecV4> {
  if (!validateCanonicalAuthoringSpecV4(value)) {
    const errors = validateCanonicalAuthoringSpecV4.errors;
    return {
      ok: false,
      diagnostics: (isNil(errors) ? [] : errors).map(diagnosticFor),
    };
  }

  const diagnostics = [
    ...duplicateIdDiagnostics(value),
    ...orderedRangeDiagnostics(value),
    ...traversalAreaDiagnostics(value),
    ...connectivityReferenceDiagnostics(value),
  ];
  return isEmpty(diagnostics)
    ? { ok: true, value, diagnostics: [] }
    : { ok: false, diagnostics };
}
