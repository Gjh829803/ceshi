import {
  solveLayoutV1,
  type LayoutSolveReportV1,
  type ResolvedPlacementConstraintV1,
} from "@whitebox-world/layout-solver";
import { resolveTraversalSurfaceProfileV1 } from "@whitebox-world/traversal";

import { sha256CanonicalJson } from "./canonical-json.js";
import { hashAuthoringDocumentV4 } from "./canonical-authoring-identity-v4.js";
import { resolveAuthoringLayoutV4 } from "./layout-input.js";
import { normalizeAuthoringBaseV4 } from "./normalize.js";
import { ResourceLockBuilderV1 } from "./resource-lock.js";
import type {
  AuthoringDiagnostic,
  NormalizedWorldNodeV2,
  PrimitivePrototypeSpecV2,
} from "./types.js";
import type {
  AuthoringSpecV4,
  NormalizedConnectivityRequirementV1,
  NormalizedLayoutAssertionV1,
  NormalizeAuthoringOptionsV4,
  NormalizeAuthoringResultV4,
  NormalizedWorldIRV4,
  NormalizedWorldNodeV4,
  PrimitivePrototypeSpecV4,
} from "./types-v4.js";

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
      ...(row.repairOperations === undefined
        ? {}
        : { repairOperations: row.repairOperations }),
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

function normalizedNodesV4(
  spec: AuthoringSpecV4,
  nodes: readonly NormalizedWorldNodeV2[],
  report: LayoutSolveReportV1,
  layoutSolveReportHash: `sha256:${string}`,
): readonly NormalizedWorldNodeV4[] {
  const sourceById = new Map(spec.nodes.map((node) => [node.id, node]));
  return nodes.map((node): NormalizedWorldNodeV4 => {
    const source = sourceById.get(node.id);
    if (source === undefined) {
      throw new Error(`NORMALIZED_WORLD_NODE_SOURCE_MISSING: '${node.id}'.`);
    }
    if (node.kind === "camera") {
      if (source.kind !== "camera") {
        throw new Error("NORMALIZED_WORLD_CAMERA_KIND_MISMATCH");
      }
      return structuredClone(source);
    }
    if (node.kind !== "object" && node.kind !== "anchor") {
      return structuredClone(node);
    }
    if (source.kind !== node.kind) {
      throw new Error("NORMALIZED_WORLD_PLACEMENT_KIND_MISMATCH");
    }
    const placement = report.placementsByEntityId[node.id];
    if (placement === undefined) {
      throw new Error(`NORMALIZED_WORLD_PLACEMENT_MISSING: '${node.id}'.`);
    }
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

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function restoreCanonicalV4Prototypes(
  spec: AuthoringSpecV4,
  prototypes: readonly PrimitivePrototypeSpecV2[],
): readonly PrimitivePrototypeSpecV4[] {
  const sourceById = new Map(
    spec.resources.prototypes.map((prototype) => [prototype.id, prototype] as const),
  );
  return prototypes.map((prototype) => {
    const source = sourceById.get(prototype.id);
    if (source?.traversalSurfaceBindings === undefined) {
      return structuredClone(prototype);
    }
    const traversalSurfaceBindings = deepFreeze(
      [...source.traversalSurfaceBindings]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((binding) => structuredClone(binding)),
    );
    return {
      ...structuredClone(prototype),
      traversalSurfaceBindings,
    };
  });
}

function augmentResourceLockWithTraversalSurfaceProfiles(
  spec: AuthoringSpecV4,
  baseResourceLock: NormalizedWorldIRV4["resources"]["resourceLock"],
): {
  readonly diagnostics: readonly AuthoringDiagnostic[];
  readonly resourceLock: NormalizedWorldIRV4["resources"]["resourceLock"];
  readonly resourceLockHash: string;
} {
  const diagnostics: AuthoringDiagnostic[] = [];
  const builder = new ResourceLockBuilderV1();
  baseResourceLock.forEach((entry, index) => {
    builder.addResolvedResource(
      entry,
      `/resources/resourceLock/${index}`,
      diagnostics,
    );
  });
  const seenProfileRefs = new Set<string>();
  spec.resources.prototypes.forEach((prototype, prototypeIndex) => {
    prototype.traversalSurfaceBindings?.forEach((binding, bindingIndex) => {
      if (seenProfileRefs.has(binding.traversalSurfaceProfileRef)) return;
      seenProfileRefs.add(binding.traversalSurfaceProfileRef);
      const instancePath =
        `/resources/prototypes/${prototypeIndex}/traversalSurfaceBindings/${bindingIndex}/traversalSurfaceProfileRef`;
      try {
        const resolved = resolveTraversalSurfaceProfileV1(
          binding.traversalSurfaceProfileRef,
        );
        builder.addResolvedResource(
          {
            resourceRef: resolved.resourceRef,
            resourceKind: "traversal-surface-profile",
            resolvedVersion: resolved.resolvedVersion,
            contentHash: resolved.contentHash,
          },
          instancePath,
          diagnostics,
        );
      } catch {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_REFERENCE_NOT_FOUND",
          instancePath,
          message:
            `Traversal Surface Profile '${binding.traversalSurfaceProfileRef}' could not be resolved.`,
          details: { resourceRef: binding.traversalSurfaceProfileRef },
        });
      }
    });
  });
  const { resourceLock, resourceLockHash } = builder.finish();
  return { diagnostics, resourceLock, resourceLockHash };
}

function normalizeConnectivityRequirement(
  requirement: AuthoringSpecV4["constraints"]["connectivity"][number],
): NormalizedConnectivityRequirementV1 {
  return {
    constraintId: requirement.id,
    kind: requirement.kind,
    traversingEntityId: requirement.traversingEntityId,
    startAnchorEntityId: requirement.startAnchorEntityId,
    destinationAnchorEntityId: requirement.destinationAnchorEntityId,
    routeId: requirement.routeId,
  };
}

export function normalizeAuthoringSpecV4(
  value: unknown,
  options: NormalizeAuthoringOptionsV4 = {},
): NormalizeAuthoringResultV4 {
  const resolved = resolveAuthoringLayoutV4(value, options);
  if (
    !resolved.ok ||
    resolved.value === undefined ||
    resolved.resolvedSolverProfile === undefined
  ) {
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

  const spec = value as AuthoringSpecV4;
  const finalTransformsByEntityId = Object.fromEntries(
    Object.entries(solveResult.report.placementsByEntityId).map(
      ([entityId, placement]) => [entityId, placement.transform],
    ),
  );
  const normalizedBaseResult = normalizeAuthoringBaseV4(spec, {
    ...options,
    finalTransformsByEntityId,
  });
  if (!normalizedBaseResult.ok || normalizedBaseResult.value === undefined) {
    return {
      ok: false,
      diagnostics: normalizedBaseResult.diagnostics,
      layoutSolveReport: solveResult.report,
      layoutSolveReportHash: solveResult.layoutSolveReportHash,
    };
  }
  const normalizedBase = normalizedBaseResult.value;
  const lock = augmentResourceLockWithTraversalSurfaceProfiles(
    spec,
    normalizedBase.resources.resourceLock,
  );
  if (lock.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      ok: false,
      diagnostics: lock.diagnostics,
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
  const resources: NormalizedWorldIRV4["resources"] = {
    ...structuredClone(normalizedBase.resources),
    prototypes: restoreCanonicalV4Prototypes(
      spec,
      normalizedBase.resources.prototypes,
    ),
    resourceLock: lock.resourceLock,
    resourceLockHash: lock.resourceLockHash,
  };
  const canonicalBase = { ...structuredClone(normalizedBase), resources };
  const normalized: NormalizedWorldIRV4 = {
    ...canonicalBase,
    kind: "worldkit-normalized-world",
    schemaVersion: 4,
    authoringSpecHash: hashAuthoringDocumentV4(spec),
    nodes: normalizedNodesV4(
      spec,
      normalizedBase.nodes,
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
      heightfields: Object.values(
        resolved.value.geometry.heightfieldsByTerrainEntityId,
      )
        .sort((left, right) =>
          left.terrainEntityId.localeCompare(right.terrainEntityId),
        )
        .map((heightfield) => structuredClone(heightfield)),
      assertions,
      traversalAreas: [...spec.spatial.traversalAreas]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((area) => structuredClone(area)),
      connectivityRequirements: spec.constraints.connectivity
        .map(normalizeConnectivityRequirement)
        .sort((left, right) => left.constraintId.localeCompare(right.constraintId)),
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
