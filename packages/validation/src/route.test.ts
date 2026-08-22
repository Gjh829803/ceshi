import { describe, expect, it } from "vitest";

import {
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2,
  validateValidationProfileV1,
  validateValidationProfileV2,
} from "./index";

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
});
