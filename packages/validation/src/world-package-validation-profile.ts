import { OUTDOOR_WORLD_PACKAGE_DEV_ROUTE_RUNTIME_GATE_THRESHOLDS_V1 } from "./route";
import { hashValidationProfileV1 } from "./profile";

import type { WorldPackageMetricDefinitionV1, WorldPackageValidationProfileV1 } from "./world-package-validation-types";

const THRESHOLDS = OUTDOOR_WORLD_PACKAGE_DEV_ROUTE_RUNTIME_GATE_THRESHOLDS_V1;

function evaluatorRef(metricId: string): string {
  return `worldkit://validation-evaluator/${metricId}@1`;
}

function booleanMetric(
  id: string,
  expectedValue: boolean,
): WorldPackageMetricDefinitionV1 {
  return {
    id,
    kind: "boolean-assertion",
    isRequired: true,
    expectedValue,
    evaluatorProfileRef: evaluatorRef(id),
  };
}

function countMetric(
  id: string,
  bounds: {
    readonly minimumAllowedCount?: number;
    readonly maximumAllowedCount?: number;
  },
): WorldPackageMetricDefinitionV1 {
  return {
    id,
    kind: "count-threshold",
    isRequired: true,
    evaluatorProfileRef: evaluatorRef(id),
    ...bounds,
  };
}

function metersMetric(
  id: string,
  bounds: {
    readonly minimumAllowedMeters?: number;
    readonly maximumAllowedMeters?: number;
  },
): WorldPackageMetricDefinitionV1 {
  return {
    id,
    kind: "meters-threshold",
    isRequired: true,
    evaluatorProfileRef: evaluatorRef(id),
    ...bounds,
  };
}

function degreesMetric(
  id: string,
  bounds: {
    readonly minimumAllowedDegrees?: number;
    readonly maximumAllowedDegrees?: number;
  },
): WorldPackageMetricDefinitionV1 {
  return {
    id,
    kind: "degrees-threshold",
    isRequired: true,
    evaluatorProfileRef: evaluatorRef(id),
    ...bounds,
  };
}

function ticksMetric(
  id: string,
  bounds: {
    readonly minimumAllowedTicks?: number;
    readonly maximumAllowedTicks?: number;
  },
): WorldPackageMetricDefinitionV1 {
  return {
    id,
    kind: "ticks-threshold",
    isRequired: true,
    evaluatorProfileRef: evaluatorRef(id),
    ...bounds,
  };
}

function costMetric(
  id: string,
  bounds: {
    readonly minimumAllowedCost?: number;
    readonly maximumAllowedCost?: number;
  },
): WorldPackageMetricDefinitionV1 {
  return {
    id,
    kind: "cost-threshold",
    isRequired: true,
    evaluatorProfileRef: evaluatorRef(id),
    ...bounds,
  };
}

export const OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1 = {
  kind: "worldkit-validation-profile",
  schemaVersion: 1,
  id: "outdoor-world-package-dev",
  resourceRef: "worldkit://validation-profile/outdoor-world-package-dev@1",
  version: "1.0.0",
  subjectKind: "world-package",
  routeRuntimeGateThresholds: THRESHOLDS,
  gateDefinitionsById: {
    "route-connectivity": {
      id: "route-connectivity",
      requirement: "blocking",
      metricDefinitionsById: {
        "required-route-count": countMetric("required-route-count", {
          minimumAllowedCount: 1,
        }),
        "unreachable-required-route-count": countMetric(
          "unreachable-required-route-count",
          { maximumAllowedCount: 0 },
        ),
        "maximum-observed-step-height-meters": metersMetric(
          "maximum-observed-step-height-meters",
          {},
        ),
        "maximum-observed-slope-degrees": degreesMetric(
          "maximum-observed-slope-degrees",
          {},
        ),
        "minimum-observed-clearance-width-meters": metersMetric(
          "minimum-observed-clearance-width-meters",
          {},
        ),
        "minimum-observed-clearance-height-meters": metersMetric(
          "minimum-observed-clearance-height-meters",
          {},
        ),
        "maximum-observed-surface-gap-meters": metersMetric(
          "maximum-observed-surface-gap-meters",
          {},
        ),
        "total-route-path-distance-meters": metersMetric("total-route-path-distance-meters", {
          minimumAllowedMeters: 0,
        }),
        "total-route-path-cost": costMetric("total-route-path-cost", {
          minimumAllowedCost: 0,
        }),
        "total-traversal-graph-node-count": countMetric("total-traversal-graph-node-count", {
          minimumAllowedCount: 1,
        }),
        "total-traversal-graph-edge-count": countMetric("total-traversal-graph-edge-count", {
          minimumAllowedCount: 0,
        }),
        "all-traversal-locks-match": booleanMetric("all-traversal-locks-match", true),
      },
    },
    "route-runtime-conformance": {
      id: "route-runtime-conformance",
      requirement: "blocking",
      metricDefinitionsById: {
        "completed-required-route-count": countMetric(
          "completed-required-route-count",
          { minimumAllowedCount: 1 },
        ),
        "failed-required-route-count": countMetric("failed-required-route-count", {
          maximumAllowedCount: 0,
        }),
        "maximum-stalled-duration-ticks": ticksMetric(
          "maximum-stalled-duration-ticks",
          { maximumAllowedTicks: THRESHOLDS.stalledWindowTicks },
        ),
        "maximum-route-deviation-meters-xz": metersMetric(
          "maximum-route-deviation-meters-xz",
          { maximumAllowedMeters: THRESHOLDS.maximumRouteDeviationMetersXZ },
        ),
        "maximum-consecutive-unexpected-unsupported-ticks": ticksMetric(
          "maximum-consecutive-unexpected-unsupported-ticks",
          { maximumAllowedTicks: THRESHOLDS.maximumConsecutiveUnsupportedTicks },
        ),
        "total-sliding-duration-ticks": ticksMetric("total-sliding-duration-ticks", {
          minimumAllowedTicks: 0,
        }),
        "unexpected-support-loss-count": countMetric(
          "unexpected-support-loss-count",
          { maximumAllowedCount: 0 },
        ),
        "wrong-support-surface-count": countMetric("wrong-support-surface-count", {
          maximumAllowedCount: 0,
        }),
        "invalid-physics-value-count": countMetric("invalid-physics-value-count", {
          maximumAllowedCount: 0,
        }),
        "maximum-completion-duration-ticks": ticksMetric("maximum-completion-duration-ticks", {
          maximumAllowedTicks: THRESHOLDS.maximumProbeTicks,
        }),
        "all-traversal-locks-match": booleanMetric("all-traversal-locks-match", true),
      },
    },
  },
} as const satisfies WorldPackageValidationProfileV1;

export const OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V1 =
  hashValidationProfileV1(OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1);

