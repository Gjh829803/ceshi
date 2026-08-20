import {
  solveLayoutV1,
  type LayoutSolveReportV1,
  type ResolvedPlacementConstraintV1,
} from "@whitebox-world/layout-solver";

import { sha256CanonicalJson } from "./canonical-json.js";
import {
  resolveAuthoringLayoutV3,
} from "./layout-input.js";
import { normalizeAuthoringBaseV3 } from "./normalize.js";
import type { AuthoringDiagnostic, NormalizedWorldNodeV2 } from "./types.js";
import type {
  AuthoringSpecV3,
  NormalizedLayoutAssertionV1,
  NormalizeAuthoringOptionsV3,
  NormalizeAuthoringResultV3,
  NormalizedWorldIRV3,
  NormalizedWorldNodeV3,
} from "./types-v3.js";

function solverDiagnostic(
  row: LayoutSolveReportV1["diagnostics"][number],
): AuthoringDiagnostic {
  return {
    severity: "error",
    code: row.code,
    instancePath: row.instancePath,
    message: `Layout solve failed with '${row.code}'.`,
    details: {
      ...(row.entityId === undefined ? {} : { entityId: row.entityId }),
      ...(row.constraintIds === undefined ? {} : { constraintIds: row.constraintIds }),
      ...(row.repairOperations === undefined ? {} : { repairOperations: row.repairOperations }),
    },
  };
}

function assertionFor(
  constraint: ResolvedPlacementConstraintV1,
  report: LayoutSolveReportV1,
): NormalizedLayoutAssertionV1 {
  const evaluation = report.constraintResultsById[constraint.id];
  if (evaluation === undefined || !evaluation.satisfied) {
    throw new Error(`NORMALIZED_LAYOUT_ASSERTION_MISSING: '${constraint.id}'.`);
  }
  const {
    id: constraintId,
    requirement: _requirement,
    preferenceWeightRatio: _preferenceWeightRatio,
    ...expectation
  } = constraint;
  return {
    ...expectation,
    constraintId,
    evidenceEntityIds: [...evaluation.evidenceIds],
    measurements: structuredClone(evaluation.measurements),
    tolerances: structuredClone(evaluation.tolerances),
  } as NormalizedLayoutAssertionV1;
}

function normalizedNodesV3(
  spec: AuthoringSpecV3,
  nodes: readonly NormalizedWorldNodeV2[],
  report: LayoutSolveReportV1,
  layoutSolveReportHash: `sha256:${string}`,
): readonly NormalizedWorldNodeV3[] {
  const sourceById = new Map(spec.nodes.map((node) => [node.id, node]));
  return nodes.map((node): NormalizedWorldNodeV3 => {
    const source = sourceById.get(node.id);
    if (source === undefined) throw new Error(`NORMALIZED_WORLD_NODE_SOURCE_MISSING: '${node.id}'.`);
    if (node.kind === "camera") {
      if (source.kind !== "camera") throw new Error("NORMALIZED_WORLD_CAMERA_KIND_MISMATCH");
      return structuredClone(source);
    }
    if (node.kind !== "object" && node.kind !== "anchor") return structuredClone(node);
    if (source.kind !== node.kind) throw new Error("NORMALIZED_WORLD_PLACEMENT_KIND_MISMATCH");
    const placement = report.placementsByEntityId[node.id];
    if (placement === undefined) throw new Error(`NORMALIZED_WORLD_PLACEMENT_MISSING: '${node.id}'.`);
    return {
      ...structuredClone(node),
      placementProvenance: {
        kind: source.placement.kind,
        candidateId: placement.candidateId,
        placementConstraintIds: source.placement.kind === "solved"
          ? [...placement.satisfiedConstraintIds]
          : [],
        solverProfileRef: report.solverProfileRef,
        layoutSolveReportHash,
      },
    };
  });
}

export function normalizeAuthoringSpecV3(
  value: unknown,
  options: NormalizeAuthoringOptionsV3 = {},
): NormalizeAuthoringResultV3 {
  const resolved = resolveAuthoringLayoutV3(value, options);
  if (!resolved.ok || resolved.value === undefined || resolved.resolvedSolverProfile === undefined) {
    return { ok: false, diagnostics: resolved.diagnostics };
  }
  const solveResult = solveLayoutV1(
    resolved.value,
    resolved.resolvedSolverProfile.profile,
  );
  if (solveResult.status !== "solved") {
    return {
      ok: false,
      diagnostics: solveResult.report.diagnostics.map(solverDiagnostic),
      layoutSolveReport: solveResult.report,
      layoutSolveReportHash: solveResult.layoutSolveReportHash,
    };
  }
  const spec = value as AuthoringSpecV3;
  const finalTransformsByEntityId = Object.fromEntries(
    Object.entries(solveResult.report.placementsByEntityId).map(([entityId, placement]) => [
      entityId,
      placement.transform,
    ]),
  );
  const normalizedBase = normalizeAuthoringBaseV3(spec, {
    ...options,
    finalTransformsByEntityId,
  });
  if (!normalizedBase.ok || normalizedBase.value === undefined) {
    return {
      ok: false,
      diagnostics: normalizedBase.diagnostics,
      layoutSolveReport: solveResult.report,
      layoutSolveReportHash: solveResult.layoutSolveReportHash,
    };
  }
  const assertions = spec.constraints.placements
    .filter((constraint) => constraint.requirement === "required")
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((constraint) => assertionFor(
      constraint as ResolvedPlacementConstraintV1,
      solveResult.report,
    ));
  const normalized: NormalizedWorldIRV3 = {
    ...structuredClone(normalizedBase.value),
    kind: "worldkit-normalized-world",
    schemaVersion: 3,
    nodes: normalizedNodesV3(
      spec,
      normalizedBase.value.nodes,
      solveResult.report,
      solveResult.layoutSolveReportHash,
    ),
    layout: {
      solverProfileRef: solveResult.report.solverProfileRef,
      resolvedVersion: solveResult.report.resolvedVersion,
      solverProfileHash: solveResult.report.solverProfileHash,
      layoutSolveReportHash: solveResult.layoutSolveReportHash,
      regions: structuredClone(spec.spatial.regions),
      routes: structuredClone(spec.spatial.routes),
      screenRegions: structuredClone(spec.spatial.screenRegions),
      heightfields: Object.values(resolved.value.geometry.heightfieldsByTerrainEntityId)
        .sort((left, right) => left.terrainEntityId.localeCompare(right.terrainEntityId))
        .map((heightfield) => structuredClone(heightfield)),
      assertions,
    },
  };
  return {
    ok: true,
    value: normalized,
    diagnostics: [],
    normalizedWorldIrHash: sha256CanonicalJson(normalized) as `sha256:${string}`,
    layoutSolveReport: solveResult.report,
    layoutSolveReportHash: solveResult.layoutSolveReportHash,
  };
}
