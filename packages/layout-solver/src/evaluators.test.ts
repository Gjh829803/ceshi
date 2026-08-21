import { describe, expect, it } from "vitest";

import {
  BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
  evaluatePlacementConstraintV1,
  resolveLayoutSolverProfileV1,
  type LayoutCandidateV1,
  type LayoutConstraintEvaluationContextV1,
  type ResolvedPlacementConstraintV1,
} from "./index.js";

function candidate(
  entityId: string,
  positionMetersXYZ: readonly [number, number, number],
  halfExtentsMetersXYZ: readonly [number, number, number] = [1, 1, 1],
  yawRadians = 0,
): LayoutCandidateV1 {
  return {
    id: `${entityId}:test:000000`,
    entityId,
    isInitial: false,
    source: { kind: "fixed" },
    transform: {
      positionMetersXYZ,
      rotationEulerRadiansXYZ: [0, yawRadians, 0],
      scaleXYZ: [1, 1, 1],
    },
    bounds: {
      minimumMetersXYZ: [
        positionMetersXYZ[0] - halfExtentsMetersXYZ[0],
        positionMetersXYZ[1] - halfExtentsMetersXYZ[1],
        positionMetersXYZ[2] - halfExtentsMetersXYZ[2],
      ],
      maximumMetersXYZ: [
        positionMetersXYZ[0] + halfExtentsMetersXYZ[0],
        positionMetersXYZ[1] + halfExtentsMetersXYZ[1],
        positionMetersXYZ[2] + halfExtentsMetersXYZ[2],
      ],
    },
    localCostRatio: 0,
  };
}

function context(): LayoutConstraintEvaluationContextV1 {
  const flat = {
    terrainEntityId: "terrain",
    centerMetersXZ: [0, 0] as const,
    sizeMetersXZ: [20, 20] as const,
    resolutionVerticesXZ: [2, 2] as const,
    heightSamplesMeters: [0, 0, 0, 0],
  };
  return {
    profile: resolveLayoutSolverProfileV1(BUILT_IN_LAYOUT_SOLVER_PROFILE_REF).profile,
    entitiesById: {
      tower: { id: "tower", semanticClassId: "landmark.tower" },
      target: { id: "target", semanticClassId: "landmark.target" },
      "side-target": { id: "side-target", semanticClassId: "landmark.target" },
      obstacle: { id: "obstacle", semanticClassId: "obstacle.wall" },
      overlapping: { id: "overlapping", semanticClassId: "obstacle.wall" },
      floating: { id: "floating", semanticClassId: "landmark.floating" },
      billboard: { id: "billboard", semanticClassId: "landmark.billboard" },
      spawn: { id: "spawn", semanticClassId: "spawn.player" },
      terrain: { id: "terrain", semanticClassId: "terrain.ground" },
    },
    regionsById: {
      zone: {
        id: "zone",
        kind: "polygon-xz",
        pointsMetersXZ: [[-5, -5], [5, -5], [5, 5], [-5, 5]],
        semanticClassId: "terrain.zone",
      },
      water: {
        id: "water",
        kind: "polygon-xz",
        pointsMetersXZ: [[2, -1], [4, -1], [4, 1], [2, 1]],
        semanticClassId: "water.sea",
      },
    },
    routesById: {
      "main-route": {
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[-4, 0], [4, 0]],
        widthMeters: 2,
        locomotionProfileRef: "worldkit://locomotion-profile/test@1",
      },
      "ridge-route": {
        id: "ridge-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[-4, 0], [4, 0]],
        widthMeters: 4,
        locomotionProfileRef: "worldkit://locomotion-profile/test@1",
      },
    },
    screenRegionsById: {
      full: { id: "full", kind: "rectangle-uv", minimumUv: [0, 0], maximumUv: [1, 1] },
      left: { id: "left", kind: "rectangle-uv", minimumUv: [0, 0], maximumUv: [0.4, 1] },
    },
    geometry: {
      heightfieldsByTerrainEntityId: {
        terrain: flat,
      },
      staticBoundsByEntityId: {},
      camerasByEntityId: {
        camera: {
          kind: "fixed",
          cameraEntityId: "camera",
          positionMetersXYZ: [0, 0, 10],
          targetMetersXYZ: [0, 0, 0],
          verticalFovDegrees: 90,
          aspectRatio: 1,
          nearClipMeters: 0.1,
          farClipMeters: 100,
        },
      },
    },
  };
}

function assignments(): Readonly<Record<string, LayoutCandidateV1>> {
  return {
    tower: candidate("tower", [0, 1, 0]),
    target: candidate("target", [0, 1, -10]),
    "side-target": candidate("side-target", [10, 1, 0]),
    obstacle: candidate("obstacle", [3, 1, 0]),
    overlapping: candidate("overlapping", [0.5, 1, 0]),
    floating: candidate("floating", [0, 2, 0]),
    billboard: candidate("billboard", [5, 0, 0]),
  };
}

const SATISFIED = [
  { id: "inside", kind: "inside-region", requirement: "required", entityId: "tower", regionId: "zone", boundaryClearanceMeters: 4 },
  { id: "outside", kind: "outside-region", requirement: "required", entityId: "tower", regionId: "water", boundaryClearanceMeters: 1 },
  { id: "distance", kind: "distance-range", requirement: "required", entityId: "tower", referenceEntityId: "target", minimumDistanceMeters: 10, maximumDistanceMeters: 10 },
  { id: "faces", kind: "faces-entity", requirement: "required", facingEntityId: "tower", targetEntityId: "target", maximumAngularDeviationDegrees: 0 },
  { id: "support", kind: "supported-by", requirement: "required", supportedEntityId: "tower", supportingEntityId: "terrain", maximumSupportGapMeters: 0, minimumSupportRatio: 1 },
  { id: "clearance", kind: "minimum-clearance", requirement: "required", entityId: "tower", otherEntityIds: ["obstacle"], clearanceMeters: 1 },
  { id: "slope", kind: "within-slope-limit", requirement: "required", entityId: "tower", terrainEntityId: "terrain", maximumSlopeDegrees: 0 },
  { id: "visible", kind: "visible-in-camera-region", requirement: "preferred", preferenceWeightRatio: 0.8, visibleEntityId: "billboard", cameraEntityId: "camera", screenRegionId: "full", minimumVisibleRatio: 1, minimumProjectedAreaRatio: 0.012 },
] as const satisfies readonly ResolvedPlacementConstraintV1[];

const VIOLATED = [
  { ...SATISFIED[0]!, boundaryClearanceMeters: 4.1 },
  { ...SATISFIED[1]!, boundaryClearanceMeters: 1.1 },
  { ...SATISFIED[2]!, minimumDistanceMeters: 10.1, maximumDistanceMeters: 20 },
  { ...SATISFIED[3]!, targetEntityId: "side-target" },
  { ...SATISFIED[4]!, supportedEntityId: "floating" },
  { ...SATISFIED[5]!, clearanceMeters: 1.1 },
  { ...SATISFIED[6]!, terrainEntityId: "steep", maximumSlopeDegrees: 10 },
  { ...SATISFIED[7]!, screenRegionId: "left" },
] as const satisfies readonly ResolvedPlacementConstraintV1[];

describe("placement constraint evaluator", () => {
  it.each(SATISFIED.map((constraint) => [constraint.kind, constraint] as const))(
    "satisfies %s at its inclusive boundary",
    (_kind, constraint) => {
      const evaluation = evaluatePlacementConstraintV1(context(), constraint, assignments());
      expect(evaluation).toMatchObject({
        constraintId: constraint.id,
        kind: constraint.kind,
        satisfied: true,
        preferenceCostRatio: 0,
      });
      expect(evaluation).not.toHaveProperty("violationCode");
    },
  );

  it.each(VIOLATED.map((constraint) => [constraint.kind, constraint] as const))(
    "rejects a violated %s constraint",
    (_kind, constraint) => {
      const evaluationContext = context();
      if (constraint.kind === "within-slope-limit") {
        (evaluationContext.geometry.heightfieldsByTerrainEntityId as Record<string, unknown>).steep = {
          ...evaluationContext.geometry.heightfieldsByTerrainEntityId.terrain,
          terrainEntityId: "steep",
          heightSamplesMeters: [0, 10, 0, 10],
        };
      }
      expect(evaluatePlacementConstraintV1(evaluationContext, constraint, assignments())).toMatchObject({
        constraintId: constraint.id,
        kind: constraint.kind,
        satisfied: false,
        violationCode: expect.stringMatching(/^PLACEMENT_/),
      });
    },
  );

  it.each([
    { ...SATISFIED[0]!, regionId: "missing" },
    { ...SATISFIED[1]!, regionId: "missing" },
    { ...SATISFIED[2]!, referenceEntityId: "missing" },
    { ...SATISFIED[3]!, targetEntityId: "missing" },
    { ...SATISFIED[4]!, supportingEntityId: "missing" },
    { ...SATISFIED[5]!, otherEntityIds: ["missing"] },
    { ...SATISFIED[6]!, terrainEntityId: "missing" },
    { ...SATISFIED[7]!, cameraEntityId: "missing" },
  ] as const)("returns a closed missing-reference result for $kind", (constraint) => {
    expect(evaluatePlacementConstraintV1(context(), constraint, assignments())).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_REFERENCE_NOT_FOUND",
      preferenceCostRatio: constraint.requirement === "preferred" ? 1 : 0,
    });
  });

  it.each([
    { ...SATISFIED[0]!, boundaryClearanceMeters: Number.NaN },
    { ...SATISFIED[1]!, boundaryClearanceMeters: Number.NaN },
    { ...SATISFIED[2]!, minimumDistanceMeters: Number.NaN },
    { ...SATISFIED[3]!, maximumAngularDeviationDegrees: Number.NaN },
    { ...SATISFIED[4]!, maximumSupportGapMeters: Number.NaN },
    { ...SATISFIED[5]!, clearanceMeters: Number.NaN },
    { ...SATISFIED[6]!, maximumSlopeDegrees: Number.NaN },
    { ...SATISFIED[7]!, minimumVisibleRatio: Number.NaN },
  ] as const)("rejects non-finite $kind input before measuring", (constraint) => {
    expect(evaluatePlacementConstraintV1(context(), constraint, assignments())).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_NON_FINITE_MEASUREMENT",
    });
  });

  it("treats zero clearance as overlap prevention rather than automatic success", () => {
    const constraint: ResolvedPlacementConstraintV1 = {
      id: "no-overlap",
      kind: "minimum-clearance",
      requirement: "required",
      entityId: "tower",
      otherEntityIds: ["overlapping"],
      clearanceMeters: 0,
    };
    expect(evaluatePlacementConstraintV1(context(), constraint, assignments())).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_CLEARANCE_CONFLICT",
    });
  });

  it("excludes the constrained entity from semantic-class clearance targets", () => {
    const constraint: ResolvedPlacementConstraintV1 = {
      id: "same-class",
      kind: "minimum-clearance",
      requirement: "required",
      entityId: "tower",
      semanticClassIds: ["landmark.tower"],
      clearanceMeters: 0,
    };
    expect(evaluatePlacementConstraintV1(context(), constraint, assignments())).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_REFERENCE_NOT_FOUND",
    });
  });

  it("supports objects from the locked collider top", () => {
    const constraint: ResolvedPlacementConstraintV1 = {
      id: "tower-on-pedestal",
      kind: "supported-by",
      requirement: "required",
      supportedEntityId: "tower",
      supportingEntityId: "pedestal",
      maximumSupportGapMeters: 0,
      minimumSupportRatio: 1,
    };
    const base = context();
    const evaluationContext: LayoutConstraintEvaluationContextV1 = {
      ...base,
      geometry: {
        ...base.geometry,
        collidersByEntityId: {
          pedestal: {
            kind: "box",
            centerMetersXYZ: [0, -0.5, 0],
            halfExtentsMetersXYZ: [2, 0.5, 2],
            rotationEulerRadiansXYZ: [0, 0, 0],
          },
        },
      },
    };
    // Tower bottom rests exactly on the collider top at Y = 0.
    expect(evaluatePlacementConstraintV1(evaluationContext, constraint, assignments())).toMatchObject({
      satisfied: true,
      measurements: { maximumSupportGapMeters: 0, supportRatio: 1 },
    });
  });

  it("rejects an object supported on the inflated AABB top of a rotated collider", () => {
    const rollRadians = 0.4;
    const constraint: ResolvedPlacementConstraintV1 = {
      id: "tower-on-rolled-pedestal",
      kind: "supported-by",
      requirement: "required",
      supportedEntityId: "tower",
      supportingEntityId: "pedestal",
      maximumSupportGapMeters: 0.2,
      minimumSupportRatio: 1,
    };
    const base = context();
    const evaluationContext: LayoutConstraintEvaluationContextV1 = {
      ...base,
      geometry: {
        ...base.geometry,
        collidersByEntityId: {
          pedestal: {
            kind: "box",
            centerMetersXYZ: [0, -2, 0],
            halfExtentsMetersXYZ: [3, 0.5, 3],
            rotationEulerRadiansXYZ: [0, 0, rollRadians],
          },
        },
      },
    };
    // Narrow supported footprint so the rolled top varies little across it.
    const towerHalfExtentsMetersXYZ = [0.25, 1, 0.25] as const;
    const aabbTopMeters = -2 + 3 * Math.sin(rollRadians) + 0.5 * Math.cos(rollRadians);
    const placedOnAabbTop = {
      ...assignments(),
      tower: candidate("tower", [0, aabbTopMeters + 1, 0], towerHalfExtentsMetersXYZ),
    };
    expect(
      evaluatePlacementConstraintV1(evaluationContext, constraint, placedOnAabbTop),
    ).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_SUPPORT_CONSTRAINT_UNSATISFIED",
    });

    const colliderTopAtCenterMeters = -2 + 0.5 * Math.cos(rollRadians);
    const placedOnColliderTop = {
      ...assignments(),
      tower: candidate(
        "tower",
        [0, colliderTopAtCenterMeters + 1, 0],
        towerHalfExtentsMetersXYZ,
      ),
    };
    expect(
      evaluatePlacementConstraintV1(evaluationContext, constraint, placedOnColliderTop),
    ).toMatchObject({ satisfied: true });
  });

  it("counts footprint samples off the collider against the support ratio", () => {
    const base = context();
    const evaluationContext: LayoutConstraintEvaluationContextV1 = {
      ...base,
      geometry: {
        ...base.geometry,
        collidersByEntityId: {
          pedestal: {
            kind: "box",
            centerMetersXYZ: [0, -0.5, 0],
            halfExtentsMetersXYZ: [0.5, 0.5, 0.5],
            rotationEulerRadiansXYZ: [0, 0, 0],
          },
        },
      },
    };
    const constraint: ResolvedPlacementConstraintV1 = {
      id: "tower-overhangs-pedestal",
      kind: "supported-by",
      requirement: "required",
      supportedEntityId: "tower",
      supportingEntityId: "pedestal",
      maximumSupportGapMeters: 0,
      minimumSupportRatio: 1,
    };
    // Only the center of the 2x2 m tower footprint hits the 1x1 m collider.
    expect(evaluatePlacementConstraintV1(evaluationContext, constraint, assignments())).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_SUPPORT_CONSTRAINT_UNSATISFIED",
      measurements: { supportRatio: 0.2 },
    });
    expect(
      evaluatePlacementConstraintV1(
        evaluationContext,
        { ...constraint, minimumSupportRatio: 0.2 },
        assignments(),
      ),
    ).toMatchObject({ satisfied: true });
  });

  it("throws OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED when only an AABB exists for the supporting object", () => {
    const constraint: ResolvedPlacementConstraintV1 = {
      id: "tower-on-aabb-only",
      kind: "supported-by",
      requirement: "required",
      supportedEntityId: "tower",
      supportingEntityId: "pedestal",
      maximumSupportGapMeters: 0,
      minimumSupportRatio: 1,
    };
    const staticOnly = context();
    (staticOnly.geometry.staticBoundsByEntityId as Record<string, unknown>).pedestal = {
      minimumMetersXYZ: [-2, -1, -2],
      maximumMetersXYZ: [2, 0, 2],
    };
    expect(() =>
      evaluatePlacementConstraintV1(staticOnly, constraint, assignments()),
    ).toThrow(/^OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED/);

    const solvedOnly = context();
    expect(() =>
      evaluatePlacementConstraintV1(solvedOnly, constraint, {
        ...assignments(),
        pedestal: candidate("pedestal", [0, -1, 0], [2, 1, 2]),
      }),
    ).toThrow(/^OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED/);
  });

  it("uses -Z as forward for faces-entity", () => {
    expect(evaluatePlacementConstraintV1(context(), SATISFIED[3]!, assignments()).measurements)
      .toMatchObject({ angularDeviationDegrees: 0 });
    expect(evaluatePlacementConstraintV1(context(), VIOLATED[3]!, assignments()).measurements)
      .toMatchObject({ angularDeviationDegrees: 90 });
  });

  it("samples the complete route width when evaluating slope", () => {
    const constraint: ResolvedPlacementConstraintV1 = {
      id: "ridge-cross-slope",
      kind: "within-slope-limit",
      requirement: "required",
      routeId: "ridge-route",
      terrainEntityId: "cross-slope",
      maximumSlopeDegrees: 10,
    };
    const evaluationContext = context();
    (evaluationContext.geometry.heightfieldsByTerrainEntityId as Record<string, unknown>)[
      "cross-slope"
    ] = {
      terrainEntityId: "cross-slope",
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [10, 4],
      resolutionVerticesXZ: [3, 3],
      heightSamplesMeters: [10, 10, 10, 0, 0, 0, 0, 0, 0],
    };
    const evaluation = evaluatePlacementConstraintV1(
      evaluationContext,
      constraint,
      assignments(),
    );
    expect(evaluation).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_SLOPE_LIMIT_EXCEEDED",
      measurements: { sampledLateralOffsetCount: 3 },
    });
  });

  it("checks projected area and heightfield/static visibility for camera regions", () => {
    const tooSmall: ResolvedPlacementConstraintV1 = {
      ...SATISFIED[7]!,
      minimumProjectedAreaRatio: 0.5,
    };
    expect(evaluatePlacementConstraintV1(context(), tooSmall, assignments())).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_CAMERA_PROJECTED_AREA_TOO_SMALL",
    });

    const occludedContext = context();
    (occludedContext.geometry.staticBoundsByEntityId as Record<string, unknown>).occluder = {
      minimumMetersXYZ: [1, -2, 4],
      maximumMetersXYZ: [4, 2, 6],
    };
    expect(
      evaluatePlacementConstraintV1(occludedContext, SATISFIED[7]!, assignments()),
    ).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_CAMERA_REGION_OCCLUDED",
      measurements: { isOccluded: true, visibleRatio: 0 },
    });

    const dynamicAssignments = {
      ...assignments(),
      "solved-occluder": candidate("solved-occluder", [2.5, 0, 5], [1.5, 2, 1]),
    };
    expect(
      evaluatePlacementConstraintV1(context(), SATISFIED[7]!, dynamicAssignments),
    ).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_CAMERA_REGION_OCCLUDED",
      measurements: { isOccluded: true },
    });
  });

  it("derives third-person camera projection from the current solved target anchor", () => {
    const derivedContext = context();
    (derivedContext.geometry.camerasByEntityId as Record<string, unknown>).camera = {
      kind: "third-person",
      cameraEntityId: "camera",
      targetAnchorEntityId: "spawn",
      targetHeightMeters: 0,
      pitchRadians: 0,
      distanceMeters: 10,
      verticalFovDegrees: 90,
      aspectRatio: 1,
      nearClipMeters: 0.1,
      farClipMeters: 100,
    };
    const centered = {
      ...assignments(),
      spawn: candidate("spawn", [5, 0, 0], [0, 0, 0]),
    };
    expect(evaluatePlacementConstraintV1(derivedContext, SATISFIED[7]!, centered)).toMatchObject({
      satisfied: true,
      measurements: { cameraTargetAnchorEntityId: "spawn" },
    });

    const moved = {
      ...centered,
      spawn: candidate("spawn", [20, 0, 0], [0, 0, 0]),
    };
    expect(evaluatePlacementConstraintV1(derivedContext, SATISFIED[7]!, moved)).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_CAMERA_REGION_UNSATISFIED",
      measurements: { cameraTargetAnchorEntityId: "spawn" },
    });

    const { spawn: _spawn, ...withoutSpawn } = centered;
    expect(evaluatePlacementConstraintV1(derivedContext, SATISFIED[7]!, withoutSpawn)).toMatchObject({
      satisfied: false,
      violationCode: "PLACEMENT_REFERENCE_NOT_FOUND",
    });
  });
});
