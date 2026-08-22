import { describe, expect, it } from "vitest";

import {
  createRouteConnectivityValidationDiagnosticV2,
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2,
  validateValidationProfileV1,
  validateValidationProfileV2,
} from "./index";
import type { RouteConnectivityFailureV1 } from "@whitebox-world/traversal";
import { ROUTE_CONNECTIVITY_FAILURE_CODES_V1 } from "@whitebox-world/traversal";

const HASH = `sha256:${"a".repeat(64)}` as const;

function failureCommon() {
  return {
    kind: "route-connectivity-failure" as const,
    schemaVersion: 1 as const,
    constraintId: "player-to-goal",
    routeId: "main-route",
    traversingEntityId: "player",
    startAnchorEntityId: "spawn",
    destinationAnchorEntityId: "goal",
    startAnchorPositionMetersXYZ: [0, 0, 0] as const,
    destinationAnchorPositionMetersXYZ: [10, 0, 0] as const,
    traversalSurfaceId: "surface-main",
    surfaceEntityId: "terrain-main",
    colliderSubshapeId: "terrain-heightfield",
    routeBuildInputHash: HASH,
    resolvedTraversalLockHash: HASH,
    graphBuilderProfileRef:
      "worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1@1",
    graphBuilderResolvedVersion: "1",
    graphBuilderProfileHash: HASH,
  };
}

describe("Route validation vocabulary", () => {
  it("freezes unique Route diagnostic codes including lock mismatch", () => {
    expect(new Set(ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2).size).toBe(
      ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2.length,
    );
    expect(ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2).toEqual(
      expect.arrayContaining([
        "ROUTE_TRAVERSAL_LOCK_MISMATCH",
        "ROUTE_CORRIDOR_LAYER_AMBIGUOUS",
        "ROUTE_START_SUPPORT_INVALID",
        "ROUTE_REQUIRED_PATH_UNREACHABLE",
        "ROUTE_WATER_TRAVERSAL_UNSUPPORTED",
        "ROUTE_RUNTIME_SUPPORT_LOST",
      ]),
    );
    expect(ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2).toEqual(
      expect.arrayContaining([...ROUTE_CONNECTIVITY_FAILURE_CODES_V1]),
    );
    expect(ROUTE_CONNECTIVITY_FAILURE_CODES_V1).not.toContain(
      "ROUTE_RUNTIME_STALLED",
    );
  });

  it("adds Route gates only on the world-package V2 Profile", () => {
    expect(OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.gateDefinitionsById)
      .toHaveProperty("route-connectivity");
    expect(OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.gateDefinitionsById)
      .toHaveProperty("route-runtime-conformance");
    expect(OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.subjectKind).toBe(
      "world-package",
    );
    expect(
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef,
    ).toBe("worldkit://validation-profile/outdoor-world-package-dev@1");
    expect(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.subjectKind,
    ).toBe("control-capture-bundle");
    expect(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById,
    ).not.toHaveProperty("route-connectivity");
    expect(validateValidationProfileV2(
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
    )).toMatchObject({ ok: true });
    expect(validateValidationProfileV1(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
    )).toMatchObject({ ok: true });
  });

  it("keeps physical step, slope, clearance, and gap bounds off the Validation Profile", () => {
    const connectivity =
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.gateDefinitionsById[
        "route-connectivity"
      ]!.metricDefinitionsById;
    expect(connectivity["maximum-observed-step-height-meters"]).not.toHaveProperty(
      "maximumAllowedMeters",
    );
    expect(connectivity["maximum-observed-slope-degrees"]).not.toHaveProperty(
      "maximumAllowedDegrees",
    );
    expect(connectivity["minimum-observed-clearance-width-meters"]).not.toHaveProperty(
      "minimumAllowedMeters",
    );
    expect(connectivity["minimum-observed-clearance-height-meters"]).not.toHaveProperty(
      "minimumAllowedMeters",
    );
    expect(connectivity["maximum-observed-surface-gap-meters"]).not.toHaveProperty(
      "maximumAllowedMeters",
    );
    expect(
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.routeRuntimeGateThresholds,
    ).toMatchObject({
      destinationToleranceMeters: 0.5,
      maximumRouteDeviationMeters: 1,
      stalledWindowTicks: 30,
      maximumProbeTicks: 1200,
    });
  });

  it("rejects cross-unit threshold fields and generic numeric bags", () => {
    const crossedUnits = structuredClone(
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
    ) as unknown as Record<string, unknown>;
    const gates = crossedUnits.gateDefinitionsById as Record<
      string,
      Record<string, unknown>
    >;
    const metrics = gates["route-connectivity"]!
      .metricDefinitionsById as Record<string, Record<string, unknown>>;
    metrics["maximum-observed-step-height-meters"] = {
      ...metrics["maximum-observed-step-height-meters"],
      maximumAllowedDegrees: 42,
    };

    expect(validateValidationProfileV2(crossedUnits)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_FIELD_UNKNOWN" }),
      ]),
    });

    const genericBag = structuredClone(
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
    ) as unknown as Record<string, unknown>;
    const genericGates = genericBag.gateDefinitionsById as Record<
      string,
      Record<string, unknown>
    >;
    const genericMetrics = genericGates["route-connectivity"]!
      .metricDefinitionsById as Record<string, Record<string, unknown>>;
    genericMetrics["route-path-cost"] = {
      ...genericMetrics["route-path-cost"],
      value: 12,
      minimum: 0,
      maximum: 99,
    };

    expect(validateValidationProfileV2(genericBag)).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "VALIDATION_FIELD_UNKNOWN" }),
      ]),
    });
  });

  it("copies canonical threshold and Anchor positions without geometry inference", () => {
    const failure = {
      ...failureCommon(),
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "step-height-threshold-exceeded",
        code: "ROUTE_STEP_HEIGHT_EXCEEDED",
        proofKind: "unique-single-reason-cut",
        proofCandidateIds: ["candidate-a"],
        failurePositionMetersXYZ: [4.25, 0.35, 0],
        terrainEntityId: "terrain-main",
        maximumObservedStepHeightMeters: 0.35,
        maximumAllowedStepHeightMeters: 0.3,
      },
    } as const satisfies RouteConnectivityFailureV1;

    const diagnostic = createRouteConnectivityValidationDiagnosticV2({
      id: "route-step-failed",
      metricId: "maximum-observed-step-height-meters",
      evidenceArtifactRef: "artifact://route-connectivity-failure",
      failure,
    });
    expect(diagnostic.positionMetersXYZ).toEqual([4.25, 0.35, 0]);
    expect(diagnostic.positionMetersXYZ).toBe(failure.reason.failurePositionMetersXYZ);
    expect(diagnostic.details).toEqual({
      kind: "meters-threshold",
      expectedMeters: 0.3,
      actualMeters: 0.35,
    });

    const generic = {
      ...failureCommon(),
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "empty-heightfield-source",
        code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
        terrainEntityId: "terrain-main",
      },
    } as const satisfies RouteConnectivityFailureV1;
    expect(createRouteConnectivityValidationDiagnosticV2({
      id: "route-unreachable",
      metricId: "unreachable-required-route-count",
      evidenceArtifactRef: "artifact://route-connectivity-failure",
      failure: generic,
    }).positionMetersXYZ).toBe(generic.startAnchorPositionMetersXYZ);
  });

  it("maps lower-bound budget proof to capacity-exceeded without fabricating actualCount", () => {
    const failure = {
      ...failureCommon(),
      status: "incomplete",
      graphStatus: "unavailable",
      reason: {
        kind: "node-budget-exceeded",
        code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
        maximumAllowedCount: 100,
        minimumRequiredCount: 101,
      },
    } as const satisfies RouteConnectivityFailureV1;

    const diagnostic = createRouteConnectivityValidationDiagnosticV2({
      id: "route-capacity",
      metricId: "traversal-graph-node-count",
      evidenceArtifactRef: "artifact://route-connectivity-failure",
      failure,
    });
    expect(diagnostic.details).toEqual({
      kind: "capacity-exceeded",
      maximumAllowedCount: 100,
      minimumRequiredCount: 101,
    });
    expect(diagnostic.details).not.toHaveProperty("actualCount");
  });
});
