import {
  emitTransformedStaticColliderTriangleMeshV1,
  emitTriangleHeightfieldSurfaceV1,
  queryCanonicalTraversalSurfaceHitsV1,
  type CanonicalTraversalSurfaceTriangleSourceV1,
} from "@whitebox-world/terrain-surface";
import type {
  CanonicalSceneExecutionPlanV1,
  RuntimeVec3V1,
} from "@whitebox-world/runtime-contracts";
import type {
  CharacterSupportStateV1,
  CharacterSupportSurfaceResolutionV1,
} from "@whitebox-world/traversal";

export interface CharacterSupportProjectionContactV1 {
  readonly pointMetersXYZ: RuntimeVec3V1;
  readonly normalXYZ: RuntimeVec3V1;
  readonly distanceMeters?: number;
  readonly motionType?: "static";
  readonly colliderId?: string;
  readonly colliderSubshapeId?: string;
  readonly logicalSubshapeId?: string;
  readonly traversalSurfaceId?: string;
  readonly surfaceEntityId?: string;
  readonly traversalSurfaceProfileRef?: string;
}

export interface CharacterSupportProjectionSampleV1 {
  readonly supportState: CharacterSupportStateV1;
  readonly supportNormalWorldXYZ: RuntimeVec3V1;
  readonly sampledControllerCenterMetersXYZ: RuntimeVec3V1;
  readonly sampledFootPositionMetersXYZ: RuntimeVec3V1;
  readonly supportContacts: readonly CharacterSupportProjectionContactV1[];
  readonly isSupportSurfaceDynamic: boolean;
}

export interface CharacterSupportProjectionLockV1 {
  readonly capsuleRadiusMeters: number;
  readonly capsuleHeightMeters: number;
  readonly footOffsetMeters: number;
  readonly keepDistanceMeters: number;
  readonly keepContactToleranceMeters: number;
  readonly maxSlopeCosine: number;
  readonly maxStepHeightMeters: number;
  readonly colliderCenterOffsetMetersXYZ: RuntimeVec3V1;
  readonly controlFeelProfileRef: string;
  readonly controlFeelProfileHash: string;
  readonly requestedControlFeelProfileRef: string;
  readonly motionProfileRef: string;
  readonly motionProfileHash: string;
  readonly requestedMotionProfileRef: string;
  readonly motionKernelRef: string;
  readonly physicsBodyProfileRef: string;
  readonly locomotionProfileRef: string;
  readonly controlProfileRef: string;
  readonly controlProfileHash: string;
  readonly mediumProfileRef: string;
}

export type RetainedSupportSurfaceResolutionPolicyV1 =
  | Readonly<{ mode: "route-walkable" }>
  | Readonly<{
      mode: "semantic-support";
      minimumContactToAggregateSupportNormalCosine: number;
    }>;

function normalizedDot(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  const leftLength = Math.hypot(...left);
  const rightLength = Math.hypot(...right);
  if (leftLength === 0 || rightLength === 0) return Number.NEGATIVE_INFINITY;
  return (
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
  ) / (leftLength * rightLength);
}

function contactMatchesPolicy(
  contact: CharacterSupportProjectionContactV1,
  sample: CharacterSupportProjectionSampleV1,
  live: CharacterSupportProjectionLockV1,
  policy: RetainedSupportSurfaceResolutionPolicyV1,
): boolean {
  if (policy.mode === "route-walkable") {
    return contact.normalXYZ[1] >= live.maxSlopeCosine;
  }
  return normalizedDot(contact.normalXYZ, sample.supportNormalWorldXYZ) >=
    policy.minimumContactToAggregateSupportNormalCosine;
}

function resolvedFromSurface(
  surface: CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number],
): CharacterSupportSurfaceResolutionV1 {
  return {
    mode: "resolved",
    traversalSurfaceId: surface.traversalSurfaceId,
    surfaceEntityId: surface.surfaceEntityId,
    colliderSubshapeId: surface.colliderSubshapeId,
    resourceRef: surface.resourceRef,
    resolvedVersion: surface.resolvedVersion,
    resourceHash: surface.resourceHash,
  };
}

const canonicalSourcesByPlan = new WeakMap<
  CanonicalSceneExecutionPlanV1,
  ReadonlyMap<string, CanonicalTraversalSurfaceTriangleSourceV1>
>();

function canonicalTraversalSurfaceSourcesV1(
  plan: CanonicalSceneExecutionPlanV1,
): ReadonlyMap<string, CanonicalTraversalSurfaceTriangleSourceV1> {
  const cached = canonicalSourcesByPlan.get(plan);
  if (cached !== undefined) return cached;
  const sources = new Map<string, CanonicalTraversalSurfaceTriangleSourceV1>();
  for (const surface of plan.traversal.surfaces) {
    if (surface.kind === "heightfield") {
      if (surface.surfaceEntityId !== plan.terrain.entityId) continue;
      const topology = emitTriangleHeightfieldSurfaceV1({
        centerMetersXZ: plan.terrain.centerMetersXZ,
        sizeMetersXZ: plan.terrain.sizeMetersXZ,
        resolutionVerticesXZ: plan.terrain.resolutionCellsXZ,
        heightSamplesMeters: plan.terrain.heightSamplesMeters,
      });
      const [originX, originY, originZ] = topology.originMetersXYZ;
      const local = topology.localPositionsMetersXYZ;
      const worldPositionsMetersXYZ: number[] = [];
      for (let index = 0; index < local.length; index += 3) {
        worldPositionsMetersXYZ.push(
          local[index]! + originX,
          local[index + 1]! + originY,
          local[index + 2]! + originZ,
        );
      }
      sources.set(surface.traversalSurfaceId, Object.freeze({
        traversalSurfaceId: surface.traversalSurfaceId,
        worldPositionsMetersXYZ: Object.freeze(worldPositionsMetersXYZ),
        triangleIndices: Object.freeze([...topology.triangleIndices]),
      }));
      continue;
    }
    const collider = plan.staticColliders.find((candidate) =>
      candidate.entityId === surface.surfaceEntityId &&
      candidate.colliderSubshapeId === surface.colliderSubshapeId
    );
    if (collider === undefined) continue;
    const world = emitTransformedStaticColliderTriangleMeshV1(
      collider.shape,
      collider.transform,
    );
    sources.set(surface.traversalSurfaceId, Object.freeze({
      traversalSurfaceId: surface.traversalSurfaceId,
      worldPositionsMetersXYZ: Object.freeze([...world.worldPositionsMetersXYZ]),
      triangleIndices: Object.freeze([...world.triangleIndices]),
    }));
  }
  const frozen: ReadonlyMap<
    string,
    CanonicalTraversalSurfaceTriangleSourceV1
  > = sources;
  canonicalSourcesByPlan.set(plan, frozen);
  return frozen;
}

// R1b design section 9.1 makes queryCanonicalTraversalSurfaceHitsV1() the one
// owner resolution shared by Graph and Runtime. Havok reports every capsule
// contact, so a coplanar seam admits both surfaces; the canonical query decides
// the owner from a single retained foot point instead.
function canonicalOwnerSurfaceV1(
  plan: CanonicalSceneExecutionPlanV1,
  sample: CharacterSupportProjectionSampleV1,
  live: CharacterSupportProjectionLockV1,
  candidates: readonly CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number][],
): CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number] | undefined {
  if (Math.hypot(...sample.supportNormalWorldXYZ) === 0) return undefined;
  const sourcesById = canonicalTraversalSurfaceSourcesV1(plan);
  const sources: CanonicalTraversalSurfaceTriangleSourceV1[] = [];
  for (const traversalSurfaceId of new Set(
    candidates.map((surface) => surface.traversalSurfaceId),
  )) {
    const source = sourcesById.get(traversalSurfaceId);
    if (source === undefined) return undefined;
    sources.push(source);
  }
  const [footXMeters, footYMeters, footZMeters] =
    sample.sampledFootPositionMetersXYZ;
  const resolution = queryCanonicalTraversalSurfaceHitsV1({
    sources,
    pointMetersXZ: [footXMeters, footZMeters],
    referenceHeightMeters: footYMeters,
    maximumReferenceHeightDifferenceMeters:
      live.keepDistanceMeters + live.keepContactToleranceMeters,
    normalAdmission: {
      mode: "retained-support",
      minimumUpwardNormalYRatio: live.maxSlopeCosine,
      referenceNormalXYZ: sample.supportNormalWorldXYZ,
      minimumReferenceNormalDotRatio: live.maxSlopeCosine,
    },
  });
  if (resolution.mode !== "resolved") return undefined;
  return candidates.find((surface) =>
    surface.traversalSurfaceId === resolution.hit.traversalSurfaceId
  );
}

export function retainedContactsAdmittedByPolicyV1(input: Readonly<{
  sample: CharacterSupportProjectionSampleV1;
  live: CharacterSupportProjectionLockV1;
  policy: RetainedSupportSurfaceResolutionPolicyV1;
}>): readonly CharacterSupportProjectionContactV1[] {
  return input.sample.supportContacts.filter((contact) =>
    contactMatchesPolicy(contact, input.sample, input.live, input.policy)
  );
}

function matchingSurfaces(
  plan: CanonicalSceneExecutionPlanV1,
  contact: CharacterSupportProjectionContactV1,
): readonly CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number][] {
  if (
    contact.colliderSubshapeId === undefined ||
    contact.traversalSurfaceId === undefined ||
    contact.surfaceEntityId === undefined
  ) return [];
  return plan.traversal.surfaces.filter((surface) =>
    surface.colliderSubshapeId === contact.colliderSubshapeId &&
    surface.traversalSurfaceId === contact.traversalSurfaceId &&
    surface.surfaceEntityId === contact.surfaceEntityId
  );
}

export function resolveRetainedSupportSurfaceV1(input: Readonly<{
  plan: CanonicalSceneExecutionPlanV1;
  sample: CharacterSupportProjectionSampleV1;
  live: CharacterSupportProjectionLockV1;
  policy: RetainedSupportSurfaceResolutionPolicyV1;
}>): CharacterSupportSurfaceResolutionV1 {
  const { plan, sample, live, policy } = input;
  if (sample.supportState === "unsupported") return { mode: "unsupported" };
  if (sample.isSupportSurfaceDynamic) return { mode: "unmatched" };

  const contacts = retainedContactsAdmittedByPolicyV1({
    sample,
    live,
    policy,
  });
  if (contacts.length === 0) return { mode: "unmatched" };

  const resolvedSurfaces: CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number][] = [];
  for (const contact of contacts) {
    const matches = matchingSurfaces(plan, contact);
    if (matches.length === 0) return { mode: "unmatched" };
    if (matches.length > 1) return { mode: "ambiguous" };
    resolvedSurfaces.push(matches[0]!);
  }
  const traversalSurfaceIds = new Set(
    resolvedSurfaces.map((surface) => surface.traversalSurfaceId),
  );
  if (traversalSurfaceIds.size !== 1) {
    const canonicalOwner = policy.mode === "route-walkable"
      ? canonicalOwnerSurfaceV1(plan, sample, live, resolvedSurfaces)
      : undefined;
    if (canonicalOwner !== undefined) return resolvedFromSurface(canonicalOwner);
    return { mode: "ambiguous" };
  }
  return resolvedFromSurface(resolvedSurfaces[0]!);
}
