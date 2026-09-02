import { appendFileSync } from "node:fs";
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

// Route-walkable admission stays maxSlopeCosine. This tighter cosine is only
// used to unique-resolve a multi-surface manifold onto the checkSupport()
// normal: slope-legal lip/corner contacts drop out, dual-layer interiors that
// both match stay fail-closed ambiguous.
const ROUTE_WALKABLE_CHECK_SUPPORT_ALIGNMENT_COSINE_V1 = 0.95;

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

function uniqueCheckSupportAlignedSurface(
  contacts: readonly CharacterSupportProjectionContactV1[],
  resolvedSurfaces: readonly CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number][],
  supportNormalWorldXYZ: RuntimeVec3V1,
): CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number] | undefined {
  const alignedSurfaces = resolvedSurfaces.filter((_, index) =>
    normalizedDot(
      contacts[index]!.normalXYZ,
      supportNormalWorldXYZ,
    ) >= ROUTE_WALKABLE_CHECK_SUPPORT_ALIGNMENT_COSINE_V1
  );
  const alignedIds = new Set(
    alignedSurfaces.map((surface) => surface.traversalSurfaceId),
  );
  if (alignedIds.size !== 1) return undefined;
  return alignedSurfaces[0];
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
  let ambiguousReason: "multi-match-one-contact" | "multi-distinct-surface-ids" | undefined;
  let firstMultiMatch:
    | Readonly<{
      contact: CharacterSupportProjectionContactV1;
      matchCount: number;
      matchSurfaceIds: readonly string[];
    }>
    | undefined;
  for (const contact of contacts) {
    const matches = matchingSurfaces(plan, contact);
    if (matches.length === 0) {
      // #region agent log
      if (
        r1bInStepUpCorridor(sample.sampledFootPositionMetersXYZ) ||
        r1bInStepUpCorridor(sample.sampledControllerCenterMetersXYZ)
      ) {
        r1bSupportDebug(
          "A",
          "retained-support-surface-resolver.ts:resolveRetainedSupportSurfaceV1",
          "unmatched-contact",
          {
            supportState: sample.supportState,
            foot: sample.sampledFootPositionMetersXYZ,
            missingFields: {
              sub: contact.colliderSubshapeId ?? null,
              ts: contact.traversalSurfaceId ?? null,
              ent: contact.surfaceEntityId ?? null,
            },
            contact: {
              p: contact.pointMetersXYZ,
              n: contact.normalXYZ,
              d: contact.distanceMeters ?? null,
              sub: contact.colliderSubshapeId ?? null,
              ts: contact.traversalSurfaceId ?? null,
              ent: contact.surfaceEntityId ?? null,
              col: contact.colliderId ?? null,
            },
            admittedCount: contacts.length,
          },
        );
      }
      // #endregion
      return { mode: "unmatched" };
    }
    if (matches.length > 1) {
      ambiguousReason = "multi-match-one-contact";
      firstMultiMatch = {
        contact,
        matchCount: matches.length,
        matchSurfaceIds: matches.map((surface) => surface.traversalSurfaceId),
      };
      // #region agent log
      r1bLogRetainedSupportResolution({
        sample,
        live,
        policy,
        admitted: contacts,
        resolvedSurfaces: [],
        ambiguousReason,
        firstMultiMatch,
        resolutionMode: "ambiguous",
      });
      // #endregion
      return { mode: "ambiguous" };
    }
    resolvedSurfaces.push(matches[0]!);
  }
  const traversalSurfaceIds = new Set(
    resolvedSurfaces.map((surface) => surface.traversalSurfaceId),
  );
  if (traversalSurfaceIds.size !== 1) {
    const checkSupportSurface = policy.mode === "route-walkable"
      ? uniqueCheckSupportAlignedSurface(
        contacts,
        resolvedSurfaces,
        sample.supportNormalWorldXYZ,
      )
      : undefined;
    if (checkSupportSurface !== undefined) {
      const resolved = resolvedFromSurface(checkSupportSurface);
      // #region agent log
      r1bSupportDebug(
        "A",
        "retained-support-surface-resolver.ts:resolveRetainedSupportSurfaceV1",
        "checkSupport-unique-resolution",
        {
          policy: policy.mode,
          supportNormal: sample.supportNormalWorldXYZ,
          uniqueResolvedTs: [checkSupportSurface.traversalSurfaceId],
          uniqueResolvedEnt: [checkSupportSurface.surfaceEntityId],
          admittedCount: contacts.length,
          alignmentCosine: ROUTE_WALKABLE_CHECK_SUPPORT_ALIGNMENT_COSINE_V1,
          resolutionMode: resolved.mode,
        },
      );
      if (
        r1bInStepUpCorridor(sample.sampledFootPositionMetersXYZ) ||
        r1bInStepUpCorridor(sample.sampledControllerCenterMetersXYZ)
      ) {
        r1bLogRetainedSupportResolution({
          sample,
          live,
          policy,
          admitted: contacts,
          resolvedSurfaces: [checkSupportSurface],
          ambiguousReason,
          firstMultiMatch,
          resolutionMode: resolved.mode,
        });
      }
      // #endregion
      return resolved;
    }
    ambiguousReason = "multi-distinct-surface-ids";
    // #region agent log
    r1bLogRetainedSupportResolution({
      sample,
      live,
      policy,
      admitted: contacts,
      resolvedSurfaces,
      ambiguousReason,
      firstMultiMatch,
      resolutionMode: "ambiguous",
    });
    // #endregion
    return { mode: "ambiguous" };
  }
  const resolved = resolvedFromSurface(resolvedSurfaces[0]!);
  // #region agent log
  if (
    r1bInStepUpCorridor(sample.sampledFootPositionMetersXYZ) ||
    r1bInStepUpCorridor(sample.sampledControllerCenterMetersXYZ)
  ) {
    r1bLogRetainedSupportResolution({
      sample,
      live,
      policy,
      admitted: contacts,
      resolvedSurfaces,
      ambiguousReason,
      firstMultiMatch,
      resolutionMode: resolved.mode,
    });
  }
  // #endregion
  return resolved;
}

let r1bAmbiguousDumpCount = 0;

export function r1bInStepUpCorridor(
  xyz: readonly number[] | undefined,
): boolean {
  if (xyz === undefined || xyz.length < 3) return false;
  return xyz[0]! >= 3.4 && xyz[0]! <= 4.6 && Math.abs(xyz[2]! - 3) <= 0.6;
}

export function r1bIsFailureTick(tick: number): boolean {
  return tick >= 46 && tick <= 50;
}

export function r1bSupportDebug(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
): void {
  const payload = {
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId: "pre-fix",
  };
  const line = JSON.stringify(payload);
  console.error(`R1B_SUPPORT_DEBUG ${line}`);
  try {
    appendFileSync("/opt/cursor/logs/debug.log", `${line}\n`);
  } catch {
    // Node-only debug sink; ignore if the file cannot be written.
  }
}

function r1bContactDump(contact: CharacterSupportProjectionContactV1) {
  return {
    p: contact.pointMetersXYZ,
    n: contact.normalXYZ,
    d: contact.distanceMeters ?? null,
    sub: contact.colliderSubshapeId ?? null,
    ts: contact.traversalSurfaceId ?? null,
    ent: contact.surfaceEntityId ?? null,
    col: contact.colliderId ?? null,
    ny: contact.normalXYZ[1],
  };
}

function r1bLogRetainedSupportResolution(input: Readonly<{
  sample: CharacterSupportProjectionSampleV1;
  live: CharacterSupportProjectionLockV1;
  policy: RetainedSupportSurfaceResolutionPolicyV1;
  admitted: readonly CharacterSupportProjectionContactV1[];
  resolvedSurfaces: readonly CanonicalSceneExecutionPlanV1["traversal"]["surfaces"][number][];
  ambiguousReason:
    | "multi-match-one-contact"
    | "multi-distinct-surface-ids"
    | undefined;
  firstMultiMatch:
    | Readonly<{
      contact: CharacterSupportProjectionContactV1;
      matchCount: number;
      matchSurfaceIds: readonly string[];
    }>
    | undefined;
  resolutionMode: string;
}>): void {
  if (
    input.resolutionMode === "ambiguous" &&
    !r1bInStepUpCorridor(input.sample.sampledFootPositionMetersXYZ)
  ) {
    r1bAmbiguousDumpCount += 1;
    if (r1bAmbiguousDumpCount > 8) return;
  }
  const rejected = input.sample.supportContacts.flatMap((contact) => {
    const admitted = input.admitted.includes(contact);
    if (admitted) return [];
    const reason = input.policy.mode === "route-walkable"
      ? (contact.normalXYZ[1] >= input.live.maxSlopeCosine
        ? "unknown"
        : "slope-cosine")
      : "semantic-normal";
    return [{ ...r1bContactDump(contact), rejectReason: reason }];
  });
  r1bSupportDebug(
    input.ambiguousReason === "multi-match-one-contact" ? "B" : "A",
    "retained-support-surface-resolver.ts:resolveRetainedSupportSurfaceV1",
    "resolver-outcome",
    {
      supportState: input.sample.supportState,
      supportNormal: input.sample.supportNormalWorldXYZ,
      foot: input.sample.sampledFootPositionMetersXYZ,
      center: input.sample.sampledControllerCenterMetersXYZ,
      isDynamic: input.sample.isSupportSurfaceDynamic,
      policy: input.policy.mode,
      maxSlopeCosine: input.live.maxSlopeCosine,
      retainedCount: input.sample.supportContacts.length,
      admittedCount: input.admitted.length,
      retained: input.sample.supportContacts.map(r1bContactDump),
      admitted: input.admitted.map(r1bContactDump),
      rejected,
      uniqueRetainedTs: [...new Set(
        input.sample.supportContacts.flatMap((contact) =>
          contact.traversalSurfaceId === undefined ? [] : [contact.traversalSurfaceId]
        ),
      )],
      uniqueAdmittedTs: [...new Set(
        input.admitted.flatMap((contact) =>
          contact.traversalSurfaceId === undefined ? [] : [contact.traversalSurfaceId]
        ),
      )],
      uniqueResolvedTs: [...new Set(
        input.resolvedSurfaces.map((surface) => surface.traversalSurfaceId),
      )],
      ambiguousReason: input.ambiguousReason ?? null,
      firstMultiMatch: input.firstMultiMatch === undefined
        ? null
        : {
          matchCount: input.firstMultiMatch.matchCount,
          matchSurfaceIds: input.firstMultiMatch.matchSurfaceIds,
          contact: r1bContactDump(input.firstMultiMatch.contact),
        },
      resolutionMode: input.resolutionMode,
    },
  );
}
