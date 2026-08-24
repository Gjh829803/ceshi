import { canonicalExecutionResourceLockEntriesV1 } from "@whitebox-world/runtime-contracts";

import { sha256CanonicalJson } from "./canonical-json.js";
import type { NormalizedWorldBase, NormalizedWorldResourcesV2 } from "./types.js";
import type {
  AuthoringSpecV4,
  NormalizedWorldResourcesV4,
} from "./types-v4.js";

const TRAVERSAL_SURFACE_PROFILE_RESOURCE_KIND = "traversal-surface-profile";

function canonicalIdentityBaseV4(
  spec: AuthoringSpecV4,
  normalizedBase: NormalizedWorldBase,
) {
  return {
    kind: spec.kind,
    schemaVersion: spec.schemaVersion,
    id: spec.id,
    seed: spec.seed,
    ...(spec.provenance === undefined
      ? {}
      : { provenance: structuredClone(spec.provenance) }),
    world: structuredClone(spec.world),
    resources: structuredClone(normalizedBase.resources),
    layout: structuredClone(spec.layout),
    spatial: {
      regions: [...spec.spatial.regions]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => structuredClone(row)),
      routes: [...spec.spatial.routes]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => structuredClone(row)),
      screenRegions: [...spec.spatial.screenRegions]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => structuredClone(row)),
    },
    nodes: [...spec.nodes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => {
        if (
          (node.kind === "object" || node.kind === "anchor") &&
          node.placement.kind === "solved"
        ) {
          return {
            ...structuredClone(node),
            placement: {
              ...structuredClone(node.placement),
              placementConstraintIds: [
                ...node.placement.placementConstraintIds,
              ].sort(),
            },
          };
        }
        if (node.kind === "camera") {
          return {
            ...structuredClone(node),
            components: {
              cameraRig: {
                ...structuredClone(node.components.cameraRig),
                allowedRigRefs: [
                  ...node.components.cameraRig.allowedRigRefs,
                ].sort(),
              },
            },
          };
        }
        return structuredClone(node);
      }),
    relationships: [...spec.relationships]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((row) => structuredClone(row)),
    rules: [...spec.rules]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((row) => structuredClone(row)),
    startup: structuredClone(spec.startup),
    constraints: {
      placements: [...spec.constraints.placements]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((constraint) => {
          if (constraint.kind !== "minimum-clearance") {
            return structuredClone(constraint);
          }
          return constraint.otherEntityIds === undefined
            ? {
                ...structuredClone(constraint),
                semanticClassIds: [...constraint.semanticClassIds].sort(),
              }
            : {
                ...structuredClone(constraint),
                otherEntityIds: [...constraint.otherEntityIds].sort(),
              };
        }),
    },
  };
}

export function projectNormalizedWorldResourcesToLayoutIdentityV4(
  resources: NormalizedWorldResourcesV4,
): NormalizedWorldResourcesV2 {
  const prototypes = resources.prototypes.map((prototype) => {
    const {
      traversalSurfaceBindings: _traversalSurfaceBindings,
      ...projectedPrototype
    } = structuredClone(prototype);
    return projectedPrototype;
  });
  const resourceLock = canonicalExecutionResourceLockEntriesV1(
    resources.resourceLock.filter(
      (entry) => entry.resourceKind !== TRAVERSAL_SURFACE_PROFILE_RESOURCE_KIND,
    ),
  );
  return {
    ...structuredClone(resources),
    prototypes,
    resourceLock,
    resourceLockHash: sha256CanonicalJson(resourceLock),
  };
}

export function canonicalAuthoringIdentityV4(
  spec: AuthoringSpecV4,
  normalizedBase: NormalizedWorldBase,
) {
  const baseIdentity = canonicalIdentityBaseV4(spec, normalizedBase);
  return {
    ...baseIdentity,
    spatial: {
      ...baseIdentity.spatial,
      traversalAreas: [...spec.spatial.traversalAreas]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => structuredClone(row)),
    },
    constraints: {
      placements: baseIdentity.constraints.placements,
      connectivity: [...spec.constraints.connectivity]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => structuredClone(row)),
    },
  };
}

export function canonicalAuthoringLayoutIdentityV4(
  spec: AuthoringSpecV4,
  normalizedBase: NormalizedWorldBase,
) {
  return canonicalIdentityBaseV4(spec, {
    ...normalizedBase,
    resources: projectNormalizedWorldResourcesToLayoutIdentityV4(
      normalizedBase.resources as NormalizedWorldResourcesV4,
    ),
  });
}
