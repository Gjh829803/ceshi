import { describe, expect, it } from "vitest";
import type { CanonicalSceneExecutionPlanV1 } from "@whitebox-world/runtime-contracts";

import {
  resolveRetainedSupportSurfaceV1,
  type CharacterSupportProjectionContactV1,
  type CharacterSupportProjectionLockV1,
  type CharacterSupportProjectionSampleV1,
} from "./retained-support-surface-resolver";

const LIVE_LOCK = Object.freeze<CharacterSupportProjectionLockV1>({
  capsuleRadiusMeters: 0.35,
  capsuleHeightMeters: 1.8,
  footOffsetMeters: 0.9,
  keepDistanceMeters: 0.05,
  keepContactToleranceMeters: 0.1,
  maxSlopeCosine: Math.cos(42 * Math.PI / 180),
  maxStepHeightMeters: 0.3,
  colliderCenterOffsetMetersXYZ: [0, 0.9, 0],
  controlFeelProfileRef: "feel",
  controlFeelProfileHash: `sha256:${"a".repeat(64)}`,
  requestedControlFeelProfileRef: "feel",
  motionProfileRef: "motion",
  motionProfileHash: `sha256:${"b".repeat(64)}`,
  requestedMotionProfileRef: "motion",
  motionKernelRef: "kernel",
  physicsBodyProfileRef: "physics",
  locomotionProfileRef: "locomotion",
  controlProfileRef: "control",
  controlProfileHash: `sha256:${"c".repeat(64)}`,
  mediumProfileRef: "medium",
});

const TERRAIN = Object.freeze({
  kind: "heightfield" as const,
  traversalSurfaceId: "traversal-surface:terrain-main",
  surfaceEntityId: "terrain-main",
  colliderSubshapeId: "collider-subshape:terrain-main",
  resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
  resolvedVersion: "1",
  resourceHash: `sha256:${"1".repeat(64)}` as const,
});

const STEP = Object.freeze({
  kind: "static-collider" as const,
  traversalSurfaceId: "traversal-surface:step-box",
  surfaceEntityId: "step-box",
  colliderSubshapeId: "collider-subshape:step-box",
  resourceRef: "package://traversal-surface/step-box.primary@1",
  resolvedVersion: "1",
  resourceHash: `sha256:${"2".repeat(64)}` as const,
  logicalSurfaceId: "primary",
  logicalSubshapeId: "primary",
  colliderHash: `sha256:${"3".repeat(64)}` as const,
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
  traversalSurfaceProfileResolvedVersion: "1",
  traversalSurfaceProfileHash: `sha256:${"4".repeat(64)}` as const,
});

const OVERLAP = Object.freeze({
  ...STEP,
  traversalSurfaceId: "traversal-surface:overlap-sheet",
  surfaceEntityId: "overlap-sheet",
  colliderSubshapeId: "collider-subshape:overlap-sheet",
  resourceRef: "package://traversal-surface/overlap-sheet.primary@1",
  resourceHash: `sha256:${"5".repeat(64)}` as const,
});

const ROUTE_WALKABLE = Object.freeze({ mode: "route-walkable" as const });

const STEP_FACE_LIP_NORMAL = Object.freeze(
  [-0.6171377301216125, 0.7868551015853882, 0] as const,
);

function planWithSurfaces(
  surfaces: CanonicalSceneExecutionPlanV1["traversal"]["surfaces"],
): CanonicalSceneExecutionPlanV1 {
  return { traversal: { surfaces } } as CanonicalSceneExecutionPlanV1;
}

function identity(surface: typeof TERRAIN | typeof STEP | typeof OVERLAP) {
  return {
    colliderSubshapeId: surface.colliderSubshapeId,
    traversalSurfaceId: surface.traversalSurfaceId,
    surfaceEntityId: surface.surfaceEntityId,
  };
}

function contact(
  surface: typeof TERRAIN | typeof STEP | typeof OVERLAP,
  input: Readonly<{
    pointMetersXYZ: readonly [number, number, number];
    normalXYZ: readonly [number, number, number];
    distanceMeters: number;
  }>,
): CharacterSupportProjectionContactV1 {
  return Object.freeze({
    ...identity(surface),
    pointMetersXYZ: input.pointMetersXYZ,
    normalXYZ: input.normalXYZ,
    distanceMeters: input.distanceMeters,
    motionType: "static" as const,
  });
}

function sample(input: Readonly<{
  supportNormalWorldXYZ?: readonly [number, number, number];
  footMetersXYZ?: readonly [number, number, number];
  contacts: readonly CharacterSupportProjectionContactV1[];
}>): CharacterSupportProjectionSampleV1 {
  const foot = input.footMetersXYZ ?? [0, 0, 0];
  return Object.freeze({
    supportState: "supported",
    supportNormalWorldXYZ: input.supportNormalWorldXYZ ?? [0, 1, 0],
    sampledControllerCenterMetersXYZ: [foot[0], foot[1] + 0.96, foot[2]],
    sampledFootPositionMetersXYZ: foot,
    supportContacts: input.contacts,
    isSupportSurfaceDynamic: false,
  });
}

function resolveRouteWalkable(
  contacts: readonly CharacterSupportProjectionContactV1[],
  options: Readonly<{
    surfaces?: CanonicalSceneExecutionPlanV1["traversal"]["surfaces"];
    supportNormalWorldXYZ?: readonly [number, number, number];
    footMetersXYZ?: readonly [number, number, number];
  }> = {},
) {
  return resolveRetainedSupportSurfaceV1({
    plan: planWithSurfaces(options.surfaces ?? [TERRAIN, STEP]),
    sample: sample({
      supportNormalWorldXYZ: options.supportNormalWorldXYZ,
      footMetersXYZ: options.footMetersXYZ,
      contacts,
    }),
    live: LIVE_LOCK,
    policy: ROUTE_WALKABLE,
  });
}

describe("resolveRetainedSupportSurfaceV1 route-walkable", () => {
  it("uniquely resolves a checkSupport floor plus a slope-legal lip on a second entity", () => {
    const floor = contact(TERRAIN, {
      pointMetersXYZ: [3.7195682525634766, 0, 3.0256941318511963],
      normalXYZ: [0, 1, 0],
      distanceMeters: 0.03755253553390503,
    });
    const lip = contact(STEP, {
      pointMetersXYZ: [4, 0, 3.0256941318511963],
      normalXYZ: STEP_FACE_LIP_NORMAL,
      distanceMeters: 0.13440707325935364,
    });

    expect(lip.normalXYZ[1]).toBeGreaterThanOrEqual(LIVE_LOCK.maxSlopeCosine);
    expect(lip.normalXYZ[1]).toBeLessThan(0.95);

    expect(resolveRouteWalkable([floor, lip], {
      footMetersXYZ: [3.719568350724153, 0.037552517441315825, 3.025694086633965],
    })).toEqual({
      mode: "resolved",
      traversalSurfaceId: TERRAIN.traversalSurfaceId,
      surfaceEntityId: TERRAIN.surfaceEntityId,
      colliderSubshapeId: TERRAIN.colliderSubshapeId,
      resourceRef: TERRAIN.resourceRef,
      resolvedVersion: TERRAIN.resolvedVersion,
      resourceHash: TERRAIN.resourceHash,
    });
  });

  it("uniquely resolves the tick-48 R1B step-up seam manifold to the checkSupport terrain floor", () => {
    expect(resolveRouteWalkable([
      contact(TERRAIN, {
        pointMetersXYZ: [4, 0, 3],
        normalXYZ: [-0.6161535382270813, 0.7856002449989319, 0.0564541295170784],
        distanceMeters: 0.13513290882110596,
      }),
      contact(TERRAIN, {
        pointMetersXYZ: [4, 0, 3.0256941318511963],
        normalXYZ: STEP_FACE_LIP_NORMAL,
        distanceMeters: 0.13440707325935364,
      }),
      contact(TERRAIN, {
        pointMetersXYZ: [3.7195682525634766, 0, 3.0256941318511963],
        normalXYZ: [0, 1, 0],
        distanceMeters: 0.03755253553390503,
      }),
      contact(TERRAIN, {
        pointMetersXYZ: [3.7195682525634766, 0, 3],
        normalXYZ: [0, 0.9974279999732971, 0.07167631387710571],
        distanceMeters: 0.03847452998161316,
      }),
      contact(STEP, {
        pointMetersXYZ: [4, 0, 3.0256941318511963],
        normalXYZ: STEP_FACE_LIP_NORMAL,
        distanceMeters: 0.13440707325935364,
      }),
    ], {
      footMetersXYZ: [3.719568350724153, 0.037552517441315825, 3.025694086633965],
    })).toMatchObject({
      mode: "resolved",
      surfaceEntityId: "terrain-main",
      traversalSurfaceId: TERRAIN.traversalSurfaceId,
    });
  });

  it("keeps dual-layer stacked interiors fail-closed ambiguous", () => {
    expect(resolveRouteWalkable([
      contact(TERRAIN, {
        pointMetersXYZ: [0, 0, 0],
        normalXYZ: [0, 1, 0],
        distanceMeters: 0.02,
      }),
      contact(OVERLAP, {
        pointMetersXYZ: [0, 0.02, 0],
        normalXYZ: [0, 1, 0],
        distanceMeters: 0.0,
      }),
    ], {
      surfaces: [TERRAIN, OVERLAP],
    })).toEqual({ mode: "ambiguous" });
  });

  it("still resolves a unique surface whose only contact is a slope-legal lip", () => {
    expect(resolveRouteWalkable([
      contact(STEP, {
        pointMetersXYZ: [4, 0, 3],
        normalXYZ: STEP_FACE_LIP_NORMAL,
        distanceMeters: 0.13,
      }),
    ], {
      supportNormalWorldXYZ: [0, 1, 0],
    })).toMatchObject({
      mode: "resolved",
      surfaceEntityId: "step-box",
    });
  });

  it("keeps an unmatched retained contact unmatched instead of selecting the checkSupport surface", () => {
    expect(resolveRouteWalkable([
      contact(TERRAIN, {
        pointMetersXYZ: [0, 0, 0],
        normalXYZ: [0, 1, 0],
        distanceMeters: 0.02,
      }),
      Object.freeze({
        pointMetersXYZ: [10_000, 0, 10_000] as const,
        normalXYZ: [0, 1, 0] as const,
        distanceMeters: 0.02,
        motionType: "static" as const,
      }),
    ])).toEqual({ mode: "unmatched" });
  });
});
