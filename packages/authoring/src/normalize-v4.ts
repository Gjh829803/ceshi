import { sha256CanonicalJson } from "./canonical-json.js";
import { canonicalAuthoringIdentityV4 } from "./canonical-authoring-identity.js";
import { normalizeAuthoringSpecV3 } from "./normalize-v3.js";
import { resolveTraversalSurfaceProfileV1 } from "@whitebox-world/traversal";
import { ResourceLockBuilderV1 } from "./resource-lock.js";
import type {
  AuthoringDiagnostic,
  PrimitivePrototypeSpecV2,
} from "./types.js";
import type { AuthoringSpecV3 } from "./types-v3.js";
import type {
  AuthoringSpecV4,
  NormalizedConnectivityRequirementV1,
  NormalizeAuthoringOptionsV4,
  NormalizeAuthoringResultV4,
  NormalizedWorldIRV4,
  PrimitivePrototypeSpecV4,
} from "./types-v4.js";
import { validateAuthoringSpecV4 } from "./validate-v4.js";

function projectPlacementsToV3(spec: AuthoringSpecV4): AuthoringSpecV3 {
  const { traversalAreas: _traversalAreas, ...spatial } = structuredClone(
    spec.spatial,
  );
  const prototypes: PrimitivePrototypeSpecV2[] = spec.resources.prototypes.map(
    (prototype) => {
      const {
        traversalSurfaceBindings: _traversalSurfaceBindings,
        ...projectedPrototype
      } = structuredClone(prototype);
      return projectedPrototype;
    },
  );
  return {
    ...structuredClone(spec),
    schemaVersion: 3,
    resources: {
      ...structuredClone(spec.resources),
      prototypes,
    },
    spatial,
    constraints: {
      placements: structuredClone([...spec.constraints.placements]),
    },
  };
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
  v3Prototypes: readonly PrimitivePrototypeSpecV2[],
): readonly PrimitivePrototypeSpecV4[] {
  const sourceById = new Map(
    spec.resources.prototypes.map((prototype) => [prototype.id, prototype] as const),
  );
  return v3Prototypes.map((prototype) => {
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
  v3ResourceLock: NormalizedWorldIRV4["resources"]["resourceLock"],
): {
  readonly diagnostics: readonly AuthoringDiagnostic[];
  readonly resourceLock: NormalizedWorldIRV4["resources"]["resourceLock"];
  readonly resourceLockHash: string;
} {
  const diagnostics: AuthoringDiagnostic[] = [];
  const builder = new ResourceLockBuilderV1();
  v3ResourceLock.forEach((entry, index) => {
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
          details: {
            resourceRef: binding.traversalSurfaceProfileRef,
          },
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

  const lock = augmentResourceLockWithTraversalSurfaceProfiles(
    spec,
    v3.value.resources.resourceLock,
  );
  if (lock.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      ok: false,
      diagnostics: lock.diagnostics,
      ...(v3.layoutSolveReport === undefined
        ? {}
        : { layoutSolveReport: v3.layoutSolveReport }),
      ...(v3.layoutSolveReportHash === undefined
        ? {}
        : { layoutSolveReportHash: v3.layoutSolveReportHash }),
    };
  }

  const v4Resources: NormalizedWorldIRV4["resources"] = {
    ...structuredClone(v3.value.resources),
    prototypes: restoreCanonicalV4Prototypes(
      spec,
      v3.value.resources.prototypes,
    ),
    resourceLock: lock.resourceLock,
    resourceLockHash: lock.resourceLockHash,
  };
  const normalizedBase = {
    ...structuredClone(v3.value),
    resources: v4Resources,
  };

  const normalized: NormalizedWorldIRV4 = {
    ...normalizedBase,
    schemaVersion: 4,
    authoringSpecHash: sha256CanonicalJson(
      canonicalAuthoringIdentityV4(spec, normalizedBase),
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
