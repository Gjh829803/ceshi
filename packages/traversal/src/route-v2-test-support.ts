import { sha256CanonicalJson } from "@whitebox-world/protocol";

import * as traversal from "./index.js";
import type {
  CanonicalTriangleSoupV1,
  RouteBuildInputV2,
} from "./build-input.js";
import type {
  TraversalCapabilityEnvelopeV1,
  TraversalSurfaceIdentityV1,
} from "./types.js";

export type RouteBuildInputV2Draft = Omit<
  RouteBuildInputV2,
  | "terrainArtifactHash"
  | "colliderArtifactHash"
  | "geometryArtifactHash"
  | "surfaceArtifactHash"
>;

export const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
export const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function terrainSoup(): CanonicalTriangleSoupV1 {
  return {
    positionsMetersXYZ: [0, 0, 0, 0, 0, 1, 1, 0, 0],
    triangleIndices: [0, 1, 2],
  };
}

export function tetSoup(dx = 0, dy = 0, dz = 0): CanonicalTriangleSoupV1 {
  return {
    positionsMetersXYZ: [
      dx + 0, dy + 0, dz + 0,
      dx + 1, dy + 0, dz + 0,
      dx + 0, dy + 0, dz + 1,
      dx + 0, dy + 1, dz + 0,
    ],
    triangleIndices: [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2],
  };
}

export function traversalLock() {
  return {
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: "player",
    resourceLockHash: HASH_A,
    subjectDefinitionRef: "worldkit://subject-definition/humanoid.third-person@1",
    subjectDefinitionHash: HASH_A,
    colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1",
    colliderProfileHash: HASH_A,
    physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
    physicsBodyProfileHash: HASH_A,
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    locomotionProfileHash: HASH_A,
    locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
    locomotionCapabilityHash: HASH_A,
    controlFeelProfileRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
    controlFeelProfileHash: HASH_A,
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    controlProfileHash: HASH_A,
    motionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
    motionProfileHash: HASH_A,
    motionKernelRef: "worldkit://motion-kernel/free-ground@1",
    motionKernelHash: HASH_A,
    mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
    mediumProfileHash: HASH_A,
    runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
    runtimeBackendResolvedVersion: "9.21.2+1.3.14",
    runtimeBackendHash: HASH_A,
    runtimeAdapterRef: "worldkit://runtime-adapter/babylon.character-controller@1",
    runtimeAdapterResolvedVersion: "1",
    runtimeAdapterHash: HASH_B,
    capsuleRadiusMeters: 0.32,
    capsuleHeightMeters: 1.92,
    colliderCenterOffsetMetersXYZ: [0, 0.96, 0],
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
  } as const;
}

export function capabilityEnvelope(): TraversalCapabilityEnvelopeV1 {
  return traversal.createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt: traversal.resolveTraversalLockV1(traversalLock()),
    graphBuilderProfile: traversal.resolveTraversalGraphBuilderProfileV2(
      traversal.BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    ),
  }).envelope;
}

export function heightfieldSurface(): TraversalSurfaceIdentityV1 {
  return {
    traversalSurfaceId: "surface-terrain",
    surfaceEntityId: "terrain-main",
    colliderSubshapeId: "terrain-heightfield",
    resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
    resolvedVersion: "1",
    resourceHash: HASH_A,
  };
}

export function platformSurface(): TraversalSurfaceIdentityV1 {
  return {
    traversalSurfaceId: "surface-platform",
    surfaceEntityId: "platform-deck",
    colliderSubshapeId: traversal.deriveColliderSubshapeIdV1(
      "platform-deck",
      "primary",
    ),
    resourceRef: "package://traversal-surface/platform-deck.primary@1",
    resolvedVersion: "1",
    resourceHash: HASH_B,
  };
}

export function platformCollider() {
  return {
    entityId: "platform-deck",
    logicalSubshapeId: "primary",
    colliderSubshapeId: traversal.deriveColliderSubshapeIdV1(
      "platform-deck",
      "primary",
    ),
    colliderHash: HASH_A,
    triangleSoup: tetSoup(2, 0, 2),
  };
}

export function wallCollider() {
  return {
    entityId: "wall-unbound",
    logicalSubshapeId: "primary",
    colliderSubshapeId: traversal.deriveColliderSubshapeIdV1(
      "wall-unbound",
      "primary",
    ),
    colliderHash: HASH_B,
    triangleSoup: tetSoup(8, 0, 0),
  };
}

function byColliderSubshapeId<T extends { readonly colliderSubshapeId: string }>(
  left: T,
  right: T,
): number {
  return left.colliderSubshapeId < right.colliderSubshapeId
    ? -1
    : left.colliderSubshapeId > right.colliderSubshapeId
    ? 1
    : 0;
}

function byTraversalSurfaceId<T extends { readonly traversalSurfaceId: string }>(
  left: T,
  right: T,
): number {
  return left.traversalSurfaceId < right.traversalSurfaceId
    ? -1
    : left.traversalSurfaceId > right.traversalSurfaceId
    ? 1
    : 0;
}

export function sortedColliders() {
  return [platformCollider(), wallCollider()].sort(byColliderSubshapeId);
}

export function sortedSurfaces() {
  return [heightfieldSurface(), platformSurface()].sort(byTraversalSurfaceId);
}

export function validV2BuildInputDraft() {
  return {
    kind: "route-build-input" as const,
    schemaVersion: 2 as const,
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_A,
    resourceLockHash: HASH_A,
    connectivityRequirement: {
      constraintId: "hero-to-goal",
      traversingEntityId: "player",
      startAnchorEntityId: "spawn-main",
      destinationAnchorEntityId: "goal",
      routeId: "main-route",
    },
    startAnchor: {
      entityId: "spawn-main",
      positionMetersXYZ: [0, 0, 0] as const,
    },
    destinationAnchor: {
      entityId: "goal",
      positionMetersXYZ: [9, 0, 0] as const,
    },
    hardRibbon: {
      routeId: "main-route",
      pointsMetersXZ: [[0, 0], [9, 0]] as const,
      widthMeters: 2,
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    },
    traversalSurfaces: sortedSurfaces(),
    capabilityEnvelope: capabilityEnvelope(),
    terrainSource: {
      kind: "bounded" as const,
      terrainEntityId: "terrain-main",
      triangleSoup: terrainSoup(),
      minimumMetersXZ: [0, 0] as const,
      maximumMetersXZ: [1, 1] as const,
    },
    staticColliders: sortedColliders(),
    blockedTraversalAreaExclusions: [] as const,
    blockedWaterExclusions: [] as const,
  };
}

export function completeV2BuildInput(
  draft: RouteBuildInputV2Draft = validV2BuildInputDraft() as RouteBuildInputV2Draft,
): RouteBuildInputV2 {
  const terrainArtifactHash = traversal.hashRouteTerrainArtifactV2(draft.terrainSource);
  const colliderArtifactHash = traversal.hashRouteColliderArtifactV2(draft.staticColliders);
  const geometryArtifactHash = traversal.hashRouteGeometryArtifactV2({
    terrainArtifactHash,
    colliderArtifactHash,
  });
  const surfaceArtifactHash = traversal.hashRouteSurfaceArtifactV2(draft.traversalSurfaces);
  return {
    ...draft,
    terrainArtifactHash,
    colliderArtifactHash,
    geometryArtifactHash,
    surfaceArtifactHash,
  };
}

export function v2BuildInputReceipt(
  draft: RouteBuildInputV2Draft = validV2BuildInputDraft() as RouteBuildInputV2Draft,
) {
  return traversal.createRouteBuildInputReceiptV2(completeV2BuildInput(draft));
}
