import type {
  CanonicalSceneExecutionPlanV1,
} from "@whitebox-world/runtime-contracts";
import type { CharacterSupportSurfaceResolutionV1 } from "@whitebox-world/traversal";

import type {
  MotionKernelLiveLockStateV1,
  RetainedCharacterSupportContactV1,
  RetainedCharacterSupportSampleV1,
} from "./motion-kernel-runtime";

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
  contact: RetainedCharacterSupportContactV1,
  sample: RetainedCharacterSupportSampleV1,
  live: MotionKernelLiveLockStateV1,
  policy: RetainedSupportSurfaceResolutionPolicyV1,
): boolean {
  if (policy.mode === "route-walkable") {
    return contact.normalXYZ[1] >= live.maxSlopeCosine;
  }
  return normalizedDot(contact.normalXYZ, sample.supportNormalWorldXYZ) >=
    policy.minimumContactToAggregateSupportNormalCosine;
}

export function retainedContactsAdmittedByPolicyV1(input: Readonly<{
  sample: RetainedCharacterSupportSampleV1;
  live: MotionKernelLiveLockStateV1;
  policy: RetainedSupportSurfaceResolutionPolicyV1;
}>): readonly RetainedCharacterSupportContactV1[] {
  return input.sample.supportContacts.filter((contact) =>
    contactMatchesPolicy(contact, input.sample, input.live, input.policy)
  );
}

function matchingSurfaces(
  plan: CanonicalSceneExecutionPlanV1,
  contact: RetainedCharacterSupportContactV1,
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
  sample: RetainedCharacterSupportSampleV1;
  live: MotionKernelLiveLockStateV1;
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
