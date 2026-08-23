import { sha256CanonicalJson } from "./canonical-json.js";
import { canonicalAuthoringIdentityV4 } from "./canonical-authoring-identity.js";
import { normalizeAuthoringSpecV3 } from "./normalize-v3.js";
import type { AuthoringSpecV3 } from "./types-v3.js";
import type {
  AuthoringSpecV4,
  NormalizedConnectivityRequirementV1,
  NormalizeAuthoringOptionsV4,
  NormalizeAuthoringResultV4,
  NormalizedWorldIRV4,
} from "./types-v4.js";
import { validateAuthoringSpecV4 } from "./validate-v4.js";

function projectPlacementsToV3(spec: AuthoringSpecV4): AuthoringSpecV3 {
  const { traversalAreas: _traversalAreas, ...spatial } = structuredClone(
    spec.spatial,
  );
  return {
    ...structuredClone(spec),
    schemaVersion: 3,
    spatial,
    constraints: {
      placements: structuredClone([...spec.constraints.placements]),
    },
  };
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
  const validated = validateAuthoringSpecV4(value);
  if (!validated.ok || validated.value === undefined) {
    return { ok: false, diagnostics: validated.diagnostics };
  }

  const spec = validated.value;
  const v3 = normalizeAuthoringSpecV3(projectPlacementsToV3(spec), options);
  if (!v3.ok || v3.value === undefined) {
    return {
      ok: false,
      diagnostics: v3.diagnostics,
      ...(v3.layoutSolveReport === undefined
        ? {}
        : { layoutSolveReport: v3.layoutSolveReport }),
      ...(v3.layoutSolveReportHash === undefined
        ? {}
        : { layoutSolveReportHash: v3.layoutSolveReportHash }),
    };
  }

  const normalized: NormalizedWorldIRV4 = {
    ...structuredClone(v3.value),
    schemaVersion: 4,
    authoringSpecHash: sha256CanonicalJson(
      canonicalAuthoringIdentityV4(spec, v3.value),
    ) as `sha256:${string}`,
    layout: {
      ...structuredClone(v3.value.layout),
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
    ...(v3.layoutSolveReport === undefined
      ? {}
      : { layoutSolveReport: v3.layoutSolveReport }),
    ...(v3.layoutSolveReportHash === undefined
      ? {}
      : { layoutSolveReportHash: v3.layoutSolveReportHash }),
  };
}
