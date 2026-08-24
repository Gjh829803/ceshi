import { canonicalExecutionResourceLockEntriesV1 } from "@whitebox-world/runtime-contracts";

import { sha256CanonicalJson } from "./canonical-json.js";
import type {
  NormalizedWorldBase,
  NormalizedWorldResourcesV2,
} from "./types.js";
import type { AuthoringSpecV3 } from "./types-v3.js";
import type {
  AuthoringSpecV4,
  NormalizedWorldResourcesV4,
} from "./types-v4.js";

function buildCanonicalAuthoringIdentityV3(
  spec: AuthoringSpecV3,
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

export type CanonicalAuthoringIdentityV3 = ReturnType<
  typeof buildCanonicalAuthoringIdentityV3
>;


const TRAVERSAL_SURFACE_PROFILE_RESOURCE_KIND = "traversal-surface-profile";

export function projectNormalizedWorldResourcesToV3LayoutIdentity(
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

export function canonicalAuthoringIdentityV3(
  spec: AuthoringSpecV3,
  normalizedBase: NormalizedWorldBase,
): CanonicalAuthoringIdentityV3 {
  return buildCanonicalAuthoringIdentityV3(spec, normalizedBase);
}

export function canonicalAuthoringIdentityV4(
  spec: AuthoringSpecV4,
  normalizedBase: NormalizedWorldBase,
) {
  const { traversalAreas: _traversalAreas, ...spatial } = structuredClone(
    spec.spatial,
  );
  const prototypes = spec.resources.prototypes.map((prototype) => {
    const {
      traversalSurfaceBindings: _traversalSurfaceBindings,
      ...projectedPrototype
    } = structuredClone(prototype);
    return projectedPrototype;
  });
  const projectedV3: AuthoringSpecV3 = {
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
  const v3Identity = canonicalAuthoringIdentityV3(projectedV3, normalizedBase);
  return {
    ...v3Identity,
    schemaVersion: 4 as const,
    spatial: {
      ...v3Identity.spatial,
      traversalAreas: [...spec.spatial.traversalAreas]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => structuredClone(row)),
    },
    constraints: {
      placements: v3Identity.constraints.placements,
      connectivity: [...spec.constraints.connectivity]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => structuredClone(row)),
    },
  };
}
