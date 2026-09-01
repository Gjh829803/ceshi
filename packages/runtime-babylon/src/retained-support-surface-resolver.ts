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
  readonly colliderSubshapeId?: string;
  readonly traversalSurfaceId?: string;
  readonly surfaceEntityId?: string;
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
  if (traversalSurfaceIds.size !== 1) return { mode: "ambiguous" };
  const surface = resolvedSurfaces[0]!;
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
