import {
  canonicalJsonBytes,
  sha256Bytes,
} from "@whitebox-world/protocol";
import {
  assertMatchingTraversalLocksV1,
  assertRouteRuntimeProbeReceiptContextV1,
  assertHeightfieldRouteBuildInputReceiptV1,
  assertHeightfieldRouteConnectivityResultForBuildInputV1,
  canonicalRouteConnectivityFailureV1,
  canonicalRouteRuntimeProbeReceiptV1,
  resolveTraversalDriverProfileV1,
  resolveTraversalLockV1,
  type ResolvedTraversalLockReceiptV1,
  type HeightfieldRouteBuildInputReceiptV1,
  type HeightfieldRouteConnectivityResultV1,
  type RouteConnectivityFailureV1,
  type RoutePathReceiptV1,
  type RouteRuntimeProbeFailureV1,
  type RouteRuntimeProbeReceiptV1,
  type TraversalGraphV1,
} from "@whitebox-world/traversal";
import { isNil } from "lodash-es";

import {
  deriveValidationGateStatusV2,
  deriveValidationReportStatusV2,
} from "./policy.js";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  hashValidationProfileV2,
} from "./profile-v2.js";
import { createRouteConnectivityValidationDiagnosticV2 } from "./route.js";
import type {
  EvidenceArtifactV2,
  GateDefinitionV2,
  GateResultV2,
  MetricDefinitionV2,
  MetricResultV2,
  ValidationDiagnosticV2,
  ValidationProfileV2,
  ValidationReportV2,
  WorldPackageValidationSubjectV1,
} from "./types-v2.js";
import { validateValidationProfileV2, validateValidationReportV2 } from "./validate-v2.js";
import { assertAccessorFreeDataGraph } from "./accessor-free-data.js";

type Sha256Hash = `sha256:${string}`;

export interface RouteValidationEvidenceBytesV2 {
  readonly traversalGraph?: Uint8Array;
  readonly routePathReceipt?: Uint8Array;
  readonly routeConnectivityFailure?: Uint8Array;
  readonly routeRuntimeProbeReceipt?: Uint8Array;
  readonly routeOverlay?: Uint8Array;
}

export interface CreateRouteValidationReportInputV2 {
  readonly reportId: string;
  readonly subject: WorldPackageValidationSubjectV1;
  readonly dependencyReportRefs?: readonly string[];
  readonly routeBuildInputReceipt: HeightfieldRouteBuildInputReceiptV1;
  readonly routeConnectivityResult: HeightfieldRouteConnectivityResultV1;
  readonly routeRuntimeProbeReceipt?: RouteRuntimeProbeReceiptV1;
  readonly resolvedTraversalLockReceipt: ResolvedTraversalLockReceiptV1;
  readonly validationProfile: ValidationProfileV2;
  readonly evidenceBytes: RouteValidationEvidenceBytesV2;
}

const CONNECTIVITY_GATE_ID = "route-connectivity";
const RUNTIME_GATE_ID = "route-runtime-conformance";

const GRAPH_ARTIFACT_ID = "traversal-graph";
const PATH_ARTIFACT_ID = "route-path-receipt";
const PROBE_ARTIFACT_ID = "route-runtime-probe-receipt";
const OVERLAY_ARTIFACT_ID = "route-overlay";

function fail(code: string): never {
  throw new Error(code);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function assertCanonicalEvidenceBytes(
  actual: Uint8Array,
  canonicalValue: unknown,
): void {
  if (!(actual instanceof Uint8Array)) {
    fail("ROUTE_VALIDATION_EVIDENCE_BYTES_INVALID");
  }
  if (!bytesEqual(actual, canonicalJsonBytes(canonicalValue))) {
    fail("ROUTE_VALIDATION_EVIDENCE_BYTES_MISMATCH");
  }
}

function artifactRef(routeId: string, filename: string): string {
  return `artifact://route/${encodeURIComponent(routeId)}/${filename}`;
}

function evidenceBase(
  id: string,
  kind: EvidenceArtifactV2["kind"],
  routeId: string,
  filename: string,
  mediaType: string,
  bytes: Uint8Array,
): Readonly<{
  id: string;
  kind: EvidenceArtifactV2["kind"];
  artifactRef: string;
  mediaType: string;
  sizeBytes: number;
  contentHash: Sha256Hash;
}> {
  return {
    id,
    kind,
    artifactRef: artifactRef(routeId, filename),
    mediaType,
    sizeBytes: bytes.byteLength,
    contentHash: sha256Bytes(bytes) as Sha256Hash,
  };
}

function canonicalProfileIdentity(
  profile: ValidationProfileV2,
): ValidationProfileV2 {
  const validation = validateValidationProfileV2(profile);
  if (
    validation.ok !== true ||
    profile.resourceRef !== OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef ||
    profile.version !== OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.version ||
    hashValidationProfileV2(profile) !== OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2
  ) {
    fail("ROUTE_VALIDATION_PROFILE_MISMATCH");
  }
  return OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2;
}

function copyBytes(value: Uint8Array | undefined): Uint8Array | undefined {
  return isNil(value) ? undefined : new Uint8Array(value);
}

function snapshotEvaluatorInput(
  input: CreateRouteValidationReportInputV2,
): CreateRouteValidationReportInputV2 {
  try {
    assertAccessorFreeDataGraph(input, "ROUTE_VALIDATION_INPUT_ACCESSOR_FORBIDDEN");
  } catch {
    fail("ROUTE_VALIDATION_INPUT_ACCESSOR_FORBIDDEN");
  }
  const profile = canonicalProfileIdentity(input.validationProfile);
  const routeBuildInputReceipt = assertHeightfieldRouteBuildInputReceiptV1(
    input.routeBuildInputReceipt,
  );
  const subject = Object.freeze({
    kind: input.subject.kind,
    worldPackageRootHash: input.subject.worldPackageRootHash,
    authoringSpecHash: input.subject.authoringSpecHash,
    normalizedWorldIrHash: input.subject.normalizedWorldIrHash,
    executionPlanHash: input.subject.executionPlanHash,
    resourceLockHash: input.subject.resourceLockHash,
    layoutSolveReportHash: input.subject.layoutSolveReportHash,
  }) satisfies WorldPackageValidationSubjectV1;
  return Object.freeze({
    reportId: input.reportId,
    subject,
    dependencyReportRefs: Object.freeze([...(input.dependencyReportRefs ?? [])]),
    routeBuildInputReceipt,
    routeConnectivityResult: assertHeightfieldRouteConnectivityResultForBuildInputV1(
      input.routeConnectivityResult,
      routeBuildInputReceipt,
    ),
    ...(isNil(input.routeRuntimeProbeReceipt)
      ? {}
      : {
          routeRuntimeProbeReceipt: canonicalRouteRuntimeProbeReceiptV1(
            input.routeRuntimeProbeReceipt,
          ),
        }),
    resolvedTraversalLockReceipt: canonicalLockReceipt(
      input.resolvedTraversalLockReceipt,
    ),
    validationProfile: profile,
    evidenceBytes: Object.freeze({
      ...(isNil(input.evidenceBytes.traversalGraph)
        ? {}
        : { traversalGraph: copyBytes(input.evidenceBytes.traversalGraph)! }),
      ...(isNil(input.evidenceBytes.routePathReceipt)
        ? {}
        : { routePathReceipt: copyBytes(input.evidenceBytes.routePathReceipt)! }),
      ...(isNil(input.evidenceBytes.routeConnectivityFailure)
        ? {}
        : {
            routeConnectivityFailure:
              copyBytes(input.evidenceBytes.routeConnectivityFailure)!,
          }),
      ...(isNil(input.evidenceBytes.routeRuntimeProbeReceipt)
        ? {}
        : {
            routeRuntimeProbeReceipt:
              copyBytes(input.evidenceBytes.routeRuntimeProbeReceipt)!,
          }),
      ...(isNil(input.evidenceBytes.routeOverlay)
        ? {}
        : { routeOverlay: copyBytes(input.evidenceBytes.routeOverlay)! }),
    }),
  });
}

function assertBuildInputWorldBindings(
  subject: WorldPackageValidationSubjectV1,
  buildInputReceipt: HeightfieldRouteBuildInputReceiptV1,
  lockReceipt: ResolvedTraversalLockReceiptV1,
): void {
  const buildInput = buildInputReceipt.input;
  if (
    buildInput.authoringSpecHash !== subject.authoringSpecHash ||
    buildInput.layoutSolveReportHash !== subject.layoutSolveReportHash ||
    buildInput.resourceLockHash !== subject.resourceLockHash ||
    buildInput.capabilityEnvelope.resourceLockHash !== subject.resourceLockHash ||
    buildInput.capabilityEnvelope.subjectEntityId !== lockReceipt.lock.subjectEntityId ||
    buildInput.capabilityEnvelope.resolvedTraversalLockHash !==
      lockReceipt.resolvedTraversalLockHash
  ) {
    fail("ROUTE_VALIDATION_WORLD_IDENTITY_MISMATCH");
  }
}

function assertWorldBindings(
  subject: WorldPackageValidationSubjectV1,
  graph: TraversalGraphV1,
  path: RoutePathReceiptV1,
  lockReceipt: ResolvedTraversalLockReceiptV1,
): void {
  if (
    graph.authoringSpecHash !== subject.authoringSpecHash ||
    graph.layoutSolveReportHash !== subject.layoutSolveReportHash ||
    graph.resourceLockHash !== subject.resourceLockHash ||
    path.authoringSpecHash !== subject.authoringSpecHash ||
    path.layoutSolveReportHash !== subject.layoutSolveReportHash ||
    path.resourceLockHash !== subject.resourceLockHash ||
    lockReceipt.lock.resourceLockHash !== subject.resourceLockHash ||
    lockReceipt.lock.subjectEntityId !== path.traversingEntityId
  ) {
    fail("ROUTE_VALIDATION_WORLD_IDENTITY_MISMATCH");
  }
}

function canonicalLockReceipt(
  value: ResolvedTraversalLockReceiptV1,
): ResolvedTraversalLockReceiptV1 {
  const canonical = resolveTraversalLockV1(value.lock);
  if (canonical.resolvedTraversalLockHash !== value.resolvedTraversalLockHash) {
    fail("ROUTE_VALIDATION_LOCK_RECEIPT_MISMATCH");
  }
  return canonical;
}

function statusForThreshold(
  value: number,
  minimum: number | undefined,
  maximum: number | undefined,
): "passed" | "failed" {
  return (
      (isNil(minimum) || value >= minimum) &&
      (isNil(maximum) || value <= maximum)
    )
    ? "passed"
    : "failed";
}

interface MeasuredMetricV2 {
  readonly value: number | boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly evidenceArtifactRef: string;
}

function evaluatedMetric(
  definition: MetricDefinitionV2,
  measured: MeasuredMetricV2,
): MetricResultV2 {
  const shared = {
    id: definition.id,
    evaluatorProfileRef: definition.evaluatorProfileRef,
    evidenceArtifactRefs: [measured.evidenceArtifactRef],
    diagnosticIds: [] as string[],
  };
  if (definition.kind === "boolean-assertion") {
    const value = measured.value as boolean;
    return {
      ...shared,
      kind: "boolean-assertion",
      status: value === definition.expectedValue ? "passed" : "failed",
      value,
      expectedValue: definition.expectedValue,
    };
  }
  if (definition.kind === "count-threshold") {
    const valueCount = measured.value as number;
    const minimumAllowedCount = measured.minimum ?? definition.minimumAllowedCount;
    const maximumAllowedCount = measured.maximum ?? definition.maximumAllowedCount;
    return {
      ...shared,
      kind: "count-threshold",
      status: statusForThreshold(
        valueCount,
        minimumAllowedCount,
        maximumAllowedCount,
      ),
      valueCount,
      ...(isNil(minimumAllowedCount) ? {} : { minimumAllowedCount }),
      ...(isNil(maximumAllowedCount) ? {} : { maximumAllowedCount }),
    };
  }
  if (definition.kind === "meters-threshold") {
    const valueMeters = measured.value as number;
    const minimumAllowedMeters = measured.minimum ?? definition.minimumAllowedMeters;
    const maximumAllowedMeters = measured.maximum ?? definition.maximumAllowedMeters;
    return {
      ...shared,
      kind: "meters-threshold",
      status: statusForThreshold(
        valueMeters,
        minimumAllowedMeters,
        maximumAllowedMeters,
      ),
      valueMeters,
      ...(isNil(minimumAllowedMeters) ? {} : { minimumAllowedMeters }),
      ...(isNil(maximumAllowedMeters) ? {} : { maximumAllowedMeters }),
    };
  }
  if (definition.kind === "degrees-threshold") {
    const valueDegrees = measured.value as number;
    const minimumAllowedDegrees = measured.minimum ?? definition.minimumAllowedDegrees;
    const maximumAllowedDegrees = measured.maximum ?? definition.maximumAllowedDegrees;
    return {
      ...shared,
      kind: "degrees-threshold",
      status: statusForThreshold(
        valueDegrees,
        minimumAllowedDegrees,
        maximumAllowedDegrees,
      ),
      valueDegrees,
      ...(isNil(minimumAllowedDegrees) ? {} : { minimumAllowedDegrees }),
      ...(isNil(maximumAllowedDegrees) ? {} : { maximumAllowedDegrees }),
    };
  }
  if (definition.kind === "ticks-threshold") {
    const valueTicks = measured.value as number;
    const minimumAllowedTicks = measured.minimum ?? definition.minimumAllowedTicks;
    const maximumAllowedTicks = measured.maximum ?? definition.maximumAllowedTicks;
    return {
      ...shared,
      kind: "ticks-threshold",
      status: statusForThreshold(
        valueTicks,
        minimumAllowedTicks,
        maximumAllowedTicks,
      ),
      valueTicks,
      ...(isNil(minimumAllowedTicks) ? {} : { minimumAllowedTicks }),
      ...(isNil(maximumAllowedTicks) ? {} : { maximumAllowedTicks }),
    };
  }
  if (definition.kind === "cost-threshold") {
    const valueCost = measured.value as number;
    const minimumAllowedCost = measured.minimum ?? definition.minimumAllowedCost;
    const maximumAllowedCost = measured.maximum ?? definition.maximumAllowedCost;
    return {
      ...shared,
      kind: "cost-threshold",
      status: statusForThreshold(
        valueCost,
        minimumAllowedCost,
        maximumAllowedCost,
      ),
      valueCost,
      ...(isNil(minimumAllowedCost) ? {} : { minimumAllowedCost }),
      ...(isNil(maximumAllowedCost) ? {} : { maximumAllowedCost }),
    };
  }
  fail(`ROUTE_VALIDATION_METRIC_KIND_UNSUPPORTED:${definition.kind}`);
}

function notEvaluatedMetric(
  definition: MetricDefinitionV2,
  diagnosticId = `route-runtime-missing-${definition.id}`,
): MetricResultV2 {
  const shared = {
    id: definition.id,
    status: "not-evaluated" as const,
    evaluatorProfileRef: definition.evaluatorProfileRef,
    evidenceArtifactRefs: [] as string[],
    diagnosticIds: [diagnosticId],
  };
  if (definition.kind === "boolean-assertion") {
    return {
      ...shared,
      kind: "boolean-assertion",
      expectedValue: definition.expectedValue,
    };
  }
  if (definition.kind === "count-threshold") {
    return {
      ...shared,
      kind: "count-threshold",
      ...(isNil(definition.minimumAllowedCount)
        ? {}
        : { minimumAllowedCount: definition.minimumAllowedCount }),
      ...(isNil(definition.maximumAllowedCount)
        ? {}
        : { maximumAllowedCount: definition.maximumAllowedCount }),
    };
  }
  if (definition.kind === "meters-threshold") {
    return {
      ...shared,
      kind: "meters-threshold",
      ...(isNil(definition.minimumAllowedMeters)
        ? {}
        : { minimumAllowedMeters: definition.minimumAllowedMeters }),
      ...(isNil(definition.maximumAllowedMeters)
        ? {}
        : { maximumAllowedMeters: definition.maximumAllowedMeters }),
    };
  }
  if (definition.kind === "degrees-threshold") {
    return {
      ...shared,
      kind: "degrees-threshold",
      ...(isNil(definition.minimumAllowedDegrees)
        ? {}
        : { minimumAllowedDegrees: definition.minimumAllowedDegrees }),
      ...(isNil(definition.maximumAllowedDegrees)
        ? {}
        : { maximumAllowedDegrees: definition.maximumAllowedDegrees }),
    };
  }
  if (definition.kind === "ticks-threshold") {
    return {
      ...shared,
      kind: "ticks-threshold",
      ...(isNil(definition.minimumAllowedTicks)
        ? {}
        : { minimumAllowedTicks: definition.minimumAllowedTicks }),
      ...(isNil(definition.maximumAllowedTicks)
        ? {}
        : { maximumAllowedTicks: definition.maximumAllowedTicks }),
    };
  }
  if (definition.kind === "cost-threshold") {
    return {
      ...shared,
      kind: "cost-threshold",
      ...(isNil(definition.minimumAllowedCost)
        ? {}
        : { minimumAllowedCost: definition.minimumAllowedCost }),
      ...(isNil(definition.maximumAllowedCost)
        ? {}
        : { maximumAllowedCost: definition.maximumAllowedCost }),
    };
  }
  fail(`ROUTE_VALIDATION_METRIC_KIND_UNSUPPORTED:${definition.kind}`);
}

function withLockDerivedResultBound(
  metric: MetricResultV2,
  lock: ResolvedTraversalLockReceiptV1["lock"],
): MetricResultV2 {
  if (
    metric.id === "maximum-observed-step-height-meters" &&
    metric.kind === "meters-threshold"
  ) {
    return { ...metric, maximumAllowedMeters: lock.maxStepHeightMeters };
  }
  if (
    metric.id === "maximum-observed-slope-degrees" &&
    metric.kind === "degrees-threshold"
  ) {
    return { ...metric, maximumAllowedDegrees: lock.maxSlopeDegrees };
  }
  if (
    metric.id === "minimum-observed-clearance-width-meters" &&
    metric.kind === "meters-threshold"
  ) {
    return { ...metric, minimumAllowedMeters: lock.capsuleRadiusMeters * 2 };
  }
  if (
    metric.id === "minimum-observed-clearance-height-meters" &&
    metric.kind === "meters-threshold"
  ) {
    return { ...metric, minimumAllowedMeters: lock.capsuleHeightMeters };
  }
  if (
    metric.id === "maximum-observed-surface-gap-meters" &&
    metric.kind === "meters-threshold"
  ) {
    return { ...metric, maximumAllowedMeters: 0 };
  }
  return metric;
}

function connectivityMeasurements(
  graph: TraversalGraphV1,
  path: RoutePathReceiptV1,
  lock: ResolvedTraversalLockReceiptV1["lock"],
  graphArtifactRef: string,
  pathArtifactRef: string,
): Readonly<Record<string, MeasuredMetricV2>> {
  return {
    "required-route-count": { value: 1, evidenceArtifactRef: pathArtifactRef },
    "unreachable-required-route-count": {
      value: 0,
      evidenceArtifactRef: pathArtifactRef,
    },
    "maximum-observed-step-height-meters": {
      value: path.maximumObservedStepHeightMeters,
      maximum: lock.maxStepHeightMeters,
      evidenceArtifactRef: pathArtifactRef,
    },
    "maximum-observed-slope-degrees": {
      value: path.maximumObservedSlopeDegrees,
      maximum: lock.maxSlopeDegrees,
      evidenceArtifactRef: pathArtifactRef,
    },
    "minimum-observed-clearance-width-meters": {
      value: path.minimumObservedClearanceWidthMeters,
      minimum: lock.capsuleRadiusMeters * 2,
      evidenceArtifactRef: pathArtifactRef,
    },
    "minimum-observed-clearance-height-meters": {
      value: path.minimumObservedClearanceHeightMeters,
      minimum: lock.capsuleHeightMeters,
      evidenceArtifactRef: pathArtifactRef,
    },
    "maximum-observed-surface-gap-meters": {
      value: path.maximumObservedSurfaceGapMeters,
      maximum: 0,
      evidenceArtifactRef: pathArtifactRef,
    },
    "route-path-distance-meters": {
      value: path.routePathDistanceMeters,
      evidenceArtifactRef: pathArtifactRef,
    },
    "route-path-cost": {
      value: path.routePathCost,
      evidenceArtifactRef: pathArtifactRef,
    },
    "traversal-graph-node-count": {
      value: Object.keys(graph.traversalNodesById).length,
      evidenceArtifactRef: graphArtifactRef,
    },
    "traversal-graph-edge-count": {
      value: Object.keys(graph.traversalEdgesById).length,
      evidenceArtifactRef: graphArtifactRef,
    },
    "traversal-lock-match": {
      value: true,
      evidenceArtifactRef: graphArtifactRef,
    },
  };
}

function runtimeMeasurements(
  probe: RouteRuntimeProbeReceiptV1,
  probeArtifactRef: string,
): Readonly<Record<string, MeasuredMetricV2>> {
  const isComplete = probe.status === "complete";
  return {
    "completed-required-route-count": {
      value: isComplete ? 1 : 0,
      evidenceArtifactRef: probeArtifactRef,
    },
    "failed-required-route-count": {
      value: isComplete ? 0 : 1,
      evidenceArtifactRef: probeArtifactRef,
    },
    "maximum-stalled-duration-ticks": {
      value: probe.metrics.maximumStalledDurationTicks,
      evidenceArtifactRef: probeArtifactRef,
    },
    "maximum-route-deviation-meters-xz": {
      value: probe.metrics.maximumRouteDeviationMetersXZ,
      evidenceArtifactRef: probeArtifactRef,
    },
    "maximum-consecutive-unexpected-unsupported-ticks": {
      value: probe.metrics.maximumConsecutiveUnexpectedUnsupportedTicks,
      evidenceArtifactRef: probeArtifactRef,
    },
    "sliding-duration-ticks": {
      value: probe.metrics.slidingDurationTicks,
      evidenceArtifactRef: probeArtifactRef,
    },
    "unexpected-support-loss-count": {
      value: probe.metrics.unexpectedSupportLossCount,
      evidenceArtifactRef: probeArtifactRef,
    },
    "wrong-support-surface-count": {
      value: probe.metrics.wrongSupportSurfaceCount,
      evidenceArtifactRef: probeArtifactRef,
    },
    "invalid-physics-value-count": {
      value: probe.metrics.invalidPhysicsValueCount,
      evidenceArtifactRef: probeArtifactRef,
    },
    "completion-duration-ticks": {
      value: probe.status === "complete"
        ? probe.completionDurationTicks
        : probe.metrics.processedTickCount,
      evidenceArtifactRef: probeArtifactRef,
    },
    "traversal-lock-match": {
      value: true,
      evidenceArtifactRef: probeArtifactRef,
    },
  };
}

interface RouteDiagnosticContextV2 {
  readonly routeId: string;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly traversalSurfaceId: string;
  readonly colliderSubshapeId: string;
  readonly positionMetersXYZ: readonly [number, number, number];
}

type MissingRuntimeEvidenceReasonV2 =
  | "route-path-unavailable"
  | "runtime-probe-missing";

function pathDiagnosticContext(path: RoutePathReceiptV1): RouteDiagnosticContextV2 {
  return {
    routeId: path.routeId,
    traversingEntityId: path.traversingEntityId,
    startAnchorEntityId: path.startAnchorEntityId,
    destinationAnchorEntityId: path.destinationAnchorEntityId,
    traversalSurfaceId: path.traversalSurfaceIdentity.traversalSurfaceId,
    colliderSubshapeId: path.traversalSurfaceIdentity.colliderSubshapeId,
    positionMetersXYZ: path.orderedPathPositionsMetersXYZ[0]!,
  };
}

function failureDiagnosticContext(
  failure: RouteConnectivityFailureV1,
): RouteDiagnosticContextV2 {
  return {
    routeId: failure.routeId,
    traversingEntityId: failure.traversingEntityId,
    startAnchorEntityId: failure.startAnchorEntityId,
    destinationAnchorEntityId: failure.destinationAnchorEntityId,
    traversalSurfaceId: failure.traversalSurfaceId,
    colliderSubshapeId: failure.colliderSubshapeId,
    positionMetersXYZ: failure.startAnchorPositionMetersXYZ,
  };
}

function missingRuntimeDiagnostic(
  definition: MetricDefinitionV2,
  context: RouteDiagnosticContextV2,
  missingRef: string,
  reason: MissingRuntimeEvidenceReasonV2,
): ValidationDiagnosticV2 {
  const isPathUnavailable = reason === "route-path-unavailable";
  return {
    id: `route-runtime-missing-${definition.id}`,
    code: "VALIDATION_REQUIRED_METRIC_MISSING",
    severity: "error",
    gateId: RUNTIME_GATE_ID,
    metricId: definition.id,
    routeId: context.routeId,
    traversingEntityId: context.traversingEntityId,
    startAnchorEntityId: context.startAnchorEntityId,
    destinationAnchorEntityId: context.destinationAnchorEntityId,
    traversalSurfaceId: context.traversalSurfaceId,
    colliderSubshapeId: context.colliderSubshapeId,
    positionMetersXYZ: context.positionMetersXYZ,
    evidenceArtifactRefs: [],
    details: {
      kind: "missing-reference",
      missingRef,
    },
    message: isPathUnavailable
      ? "Required Route Path evidence is unavailable, so Runtime conformance cannot be evaluated."
      : "Required Route Runtime Probe evidence is missing.",
    suggestedFix: isPathUnavailable
      ? "Repair Route connectivity and produce a canonical Route Path receipt before running the Runtime Probe."
      : "Run the fixed-tick Route Runtime Probe and attach its canonical receipt bytes.",
  };
}

function runtimeFailureCode(
  failure: RouteRuntimeProbeFailureV1,
): ValidationDiagnosticV2["code"] {
  switch (failure.kind) {
    case "start-support-invalid":
      return "ROUTE_START_SUPPORT_INVALID";
    case "support-surface-mismatch":
      return "ROUTE_RUNTIME_SUPPORT_SURFACE_MISMATCH";
    case "runtime-stalled":
      return "ROUTE_RUNTIME_STALLED";
    case "runtime-deviated":
      return "ROUTE_RUNTIME_DEVIATED";
    case "runtime-support-lost":
      return "ROUTE_RUNTIME_SUPPORT_LOST";
    case "maximum-probe-ticks-reached":
      return "ROUTE_RUNTIME_TIMEOUT";
  }
}

function runtimeFailureDetails(
  failure: RouteRuntimeProbeFailureV1,
  metric: MetricResultV2,
): ValidationDiagnosticV2["details"] {
  if (metric.kind === "meters-threshold") {
    return {
      kind: "meters-threshold",
      expectedMeters: metric.maximumAllowedMeters ?? metric.minimumAllowedMeters ?? 0,
      actualMeters: metric.valueMeters ?? 0,
    };
  }
  if (metric.kind === "ticks-threshold") {
    return {
      kind: "ticks-threshold",
      expectedTicks: metric.maximumAllowedTicks ?? metric.minimumAllowedTicks ?? 0,
      actualTicks: metric.valueTicks ?? 0,
    };
  }
  if (metric.kind === "count-threshold") {
    if (
      !isNil(metric.minimumAllowedCount) &&
      (isNil(metric.valueCount) || metric.valueCount < metric.minimumAllowedCount)
    ) {
      return {
        kind: "state-mismatch",
        expectedState: `count >= ${metric.minimumAllowedCount}`,
        actualState: `count = ${metric.valueCount ?? 0}`,
      };
    }
    return {
      kind: "count-threshold",
      maximumAllowedCount: metric.maximumAllowedCount ?? 0,
      actualCount: metric.valueCount ?? 0,
    };
  }
  return {
    kind: "state-mismatch",
    expectedState: "route-complete",
    actualState: failure.kind,
  };
}

function runtimeFailureDiagnostic(
  metric: MetricResultV2,
  path: RoutePathReceiptV1,
  probe: Extract<RouteRuntimeProbeReceiptV1, { readonly status: "failed" }>,
  probeArtifactRef: string,
): ValidationDiagnosticV2 {
  return {
    id: `route-runtime-failed-${metric.id}`,
    code: runtimeFailureCode(probe.failure),
    severity: "error",
    gateId: RUNTIME_GATE_ID,
    metricId: metric.id,
    routeId: path.routeId,
    traversingEntityId: path.traversingEntityId,
    startAnchorEntityId: path.startAnchorEntityId,
    destinationAnchorEntityId: path.destinationAnchorEntityId,
    traversalSurfaceId: path.traversalSurfaceIdentity.traversalSurfaceId,
    colliderSubshapeId: path.traversalSurfaceIdentity.colliderSubshapeId,
    positionMetersXYZ: probe.failure.failurePositionMetersXYZ,
    evidenceArtifactRefs: [probeArtifactRef],
    details: runtimeFailureDetails(probe.failure, metric),
    message: `Required Route '${path.routeId}' failed Runtime conformance: ${probe.failure.kind}.`,
    suggestedFix: "Inspect the cited fixed-tick Probe evidence and repair the Collider, support surface, Route corridor, or locked controller configuration.",
  };
}

function evaluatedGate(
  definition: GateDefinitionV2,
  measurements: Readonly<Record<string, MeasuredMetricV2>>,
): GateResultV2 {
  const metricResultsById = Object.fromEntries(
    Object.values(definition.metricDefinitionsById).map((metricDefinition) => {
      const measured = measurements[metricDefinition.id];
      if (isNil(measured)) {
        fail(`ROUTE_VALIDATION_METRIC_MEASUREMENT_MISSING:${metricDefinition.id}`);
      }
      return [metricDefinition.id, evaluatedMetric(metricDefinition, measured)];
    }),
  );
  const gate = {
    id: definition.id,
    requirement: definition.requirement,
    status: "incomplete" as const,
    metricResultsById,
    diagnosticIds: [] as string[],
  };
  return {
    ...gate,
    status: deriveValidationGateStatusV2(definition, gate),
  };
}

function assertFailureLockThresholds(
  failure: RouteConnectivityFailureV1,
  lock: ResolvedTraversalLockReceiptV1["lock"],
): void {
  const reason = failure.reason;
  const valid = reason.kind === "slope-threshold-exceeded"
    ? reason.maximumAllowedSlopeDegrees === lock.maxSlopeDegrees
    : reason.kind === "step-height-threshold-exceeded"
      ? reason.maximumAllowedStepHeightMeters === lock.maxStepHeightMeters
      : reason.kind === "clearance-width-insufficient"
        ? reason.minimumRequiredClearanceWidthMeters === lock.capsuleRadiusMeters * 2
        : reason.kind === "overhead-clearance-insufficient"
          ? reason.minimumRequiredClearanceHeightMeters === lock.capsuleHeightMeters
          : reason.kind === "surface-gap-exceeded"
            ? reason.maximumAllowedSurfaceGapMeters === 0
            : true;
  if (!valid) fail("ROUTE_VALIDATION_FAILURE_LOCK_THRESHOLD_MISMATCH");
}

function failureMetricMeasurement(
  definition: MetricDefinitionV2,
  failure: RouteConnectivityFailureV1,
  graph: TraversalGraphV1 | undefined,
  failureArtifactRef: string,
  graphArtifactRef: string | undefined,
): MeasuredMetricV2 | undefined {
  if (definition.id === "required-route-count") {
    return isNil(graphArtifactRef)
      ? undefined
      : { value: 1, evidenceArtifactRef: graphArtifactRef };
  }
  if (definition.id === "unreachable-required-route-count") {
    return failure.status === "unreachable"
      ? { value: 1, evidenceArtifactRef: failureArtifactRef }
      : undefined;
  }
  if (definition.id === "traversal-lock-match") {
    return isNil(graphArtifactRef)
      ? undefined
      : { value: true, evidenceArtifactRef: graphArtifactRef };
  }
  if (!isNil(graph) && definition.id === "traversal-graph-node-count") {
    return {
      value: Object.keys(graph.traversalNodesById).length,
      evidenceArtifactRef: graphArtifactRef!,
    };
  }
  if (!isNil(graph) && definition.id === "traversal-graph-edge-count") {
    return {
      value: Object.keys(graph.traversalEdgesById).length,
      evidenceArtifactRef: graphArtifactRef!,
    };
  }
  const reason = failure.reason;
  if (
    definition.id === "maximum-observed-slope-degrees" &&
    reason.kind === "slope-threshold-exceeded"
  ) {
    return {
      value: reason.maximumObservedSlopeDegrees,
      maximum: reason.maximumAllowedSlopeDegrees,
      evidenceArtifactRef: failureArtifactRef,
    };
  }
  if (
    definition.id === "maximum-observed-step-height-meters" &&
    reason.kind === "step-height-threshold-exceeded"
  ) {
    return {
      value: reason.maximumObservedStepHeightMeters,
      maximum: reason.maximumAllowedStepHeightMeters,
      evidenceArtifactRef: failureArtifactRef,
    };
  }
  if (
    definition.id === "minimum-observed-clearance-width-meters" &&
    reason.kind === "clearance-width-insufficient"
  ) {
    return {
      value: reason.minimumObservedClearanceWidthMeters,
      minimum: reason.minimumRequiredClearanceWidthMeters,
      evidenceArtifactRef: failureArtifactRef,
    };
  }
  if (
    definition.id === "minimum-observed-clearance-height-meters" &&
    reason.kind === "overhead-clearance-insufficient"
  ) {
    return {
      value: reason.minimumObservedClearanceHeightMeters,
      minimum: reason.minimumRequiredClearanceHeightMeters,
      evidenceArtifactRef: failureArtifactRef,
    };
  }
  if (
    definition.id === "maximum-observed-surface-gap-meters" &&
    reason.kind === "surface-gap-exceeded"
  ) {
    return {
      value: reason.maximumObservedSurfaceGapMeters,
      maximum: reason.maximumAllowedSurfaceGapMeters,
      evidenceArtifactRef: failureArtifactRef,
    };
  }
  return undefined;
}

function createFailureConnectivityGate(
  definition: GateDefinitionV2,
  failure: RouteConnectivityFailureV1,
  graph: TraversalGraphV1 | undefined,
  failureArtifactRef: string,
  graphArtifactRef: string | undefined,
  lock: ResolvedTraversalLockReceiptV1["lock"],
): Readonly<{
  gate: GateResultV2;
  diagnostics: readonly ValidationDiagnosticV2[];
}> {
  const diagnostics: ValidationDiagnosticV2[] = [];
  const metricResultsById = Object.fromEntries(
    Object.values(definition.metricDefinitionsById).map((metricDefinition) => {
      const measurement = failureMetricMeasurement(
        metricDefinition,
        failure,
        graph,
        failureArtifactRef,
        graphArtifactRef,
      );
      const diagnosticId = `route-connectivity-${failure.status}-${metricDefinition.id}`;
      let metric = isNil(measurement)
        ? {
            ...withLockDerivedResultBound(
              notEvaluatedMetric(metricDefinition, diagnosticId),
              lock,
            ),
            evidenceArtifactRefs: [failureArtifactRef],
          }
        : evaluatedMetric(metricDefinition, measurement);
      if (metric.status === "failed" || metric.status === "not-evaluated") {
        const diagnostic = createRouteConnectivityValidationDiagnosticV2({
          id: diagnosticId,
          metricId: metricDefinition.id,
          evidenceArtifactRef: failureArtifactRef,
          failure,
        });
        diagnostics.push(diagnostic);
        metric = { ...metric, diagnosticIds: [diagnostic.id] };
      }
      return [metricDefinition.id, metric];
    }),
  );
  const gateWithDiagnostics = {
    id: definition.id,
    requirement: definition.requirement,
    status: "incomplete" as const,
    metricResultsById,
    diagnosticIds: diagnostics.map(({ id }) => id),
  };
  return {
    gate: {
      ...gateWithDiagnostics,
      status: deriveValidationGateStatusV2(definition, gateWithDiagnostics),
    },
    diagnostics,
  };
}

function createUnavailableRuntimeGate(
  definition: GateDefinitionV2,
  context: RouteDiagnosticContextV2,
  missingRef: string,
  reason: MissingRuntimeEvidenceReasonV2,
): Readonly<{
  gate: GateResultV2;
  diagnostics: readonly ValidationDiagnosticV2[];
}> {
  const diagnostics: ValidationDiagnosticV2[] = [];
  const metricResultsById = Object.fromEntries(
    Object.values(definition.metricDefinitionsById).map((metricDefinition) => {
      const metric = notEvaluatedMetric(metricDefinition);
      diagnostics.push(
        missingRuntimeDiagnostic(metricDefinition, context, missingRef, reason),
      );
      return [metricDefinition.id, metric];
    }),
  );
  const gateWithDiagnostics = {
    id: definition.id,
    requirement: definition.requirement,
    status: "incomplete" as const,
    metricResultsById,
    diagnosticIds: diagnostics.map(({ id }) => id),
  };
  return {
    gate: {
      ...gateWithDiagnostics,
      status: deriveValidationGateStatusV2(definition, gateWithDiagnostics),
    },
    diagnostics,
  };
}

function validateCompletedReport(report: ValidationReportV2): ValidationReportV2 {
  const validation = validateValidationReportV2(report);
  if (validation.ok !== true) {
    fail(
      `ROUTE_VALIDATION_REPORT_INVALID:${JSON.stringify(validation.diagnostics)}`,
    );
  }
  return validation.value;
}

function createFailedConnectivityReport(
  input: CreateRouteValidationReportInputV2,
  connectivityResult: Exclude<
    HeightfieldRouteConnectivityResultV1,
    { readonly status: "complete" }
  >,
  lockReceipt: ResolvedTraversalLockReceiptV1,
): ValidationReportV2 {
  const failure = canonicalRouteConnectivityFailureV1(
    connectivityResult.connectivityFailure,
  );
  assertMatchingTraversalLocksV1(
    failure.resolvedTraversalLockHash,
    lockReceipt.resolvedTraversalLockHash,
  );
  if (
    lockReceipt.lock.resourceLockHash !== input.subject.resourceLockHash ||
    lockReceipt.lock.subjectEntityId !== failure.traversingEntityId
  ) {
    fail("ROUTE_VALIDATION_WORLD_IDENTITY_MISMATCH");
  }
  assertFailureLockThresholds(failure, lockReceipt.lock);
  if (isNil(input.evidenceBytes.routeConnectivityFailure)) {
    fail("ROUTE_VALIDATION_CONNECTIVITY_FAILURE_BYTES_MISSING");
  }
  assertCanonicalEvidenceBytes(
    input.evidenceBytes.routeConnectivityFailure,
    failure,
  );
  if (
    !isNil(input.routeRuntimeProbeReceipt) ||
    !isNil(input.evidenceBytes.routeRuntimeProbeReceipt) ||
    !isNil(input.evidenceBytes.routePathReceipt)
  ) {
    fail("ROUTE_VALIDATION_FAILED_CONNECTIVITY_EVIDENCE_CONFLICT");
  }

  const profile = input.validationProfile;
  const connectivityDefinition = profile.gateDefinitionsById[CONNECTIVITY_GATE_ID];
  const runtimeDefinition = profile.gateDefinitionsById[RUNTIME_GATE_ID];
  if (isNil(connectivityDefinition) || isNil(runtimeDefinition)) {
    fail("ROUTE_VALIDATION_PROFILE_GATES_MISSING");
  }
  const failureBase = evidenceBase(
    "route-connectivity-failure",
    "route-connectivity-failure",
    failure.routeId,
    "route-connectivity-failure.json",
    "application/vnd.worldkit.route-connectivity-failure.v1+json",
    input.evidenceBytes.routeConnectivityFailure,
  );
  const evidenceArtifactsById: Record<string, EvidenceArtifactV2> = {
    "route-connectivity-failure": {
      ...failureBase,
      kind: "route-connectivity-failure",
      routeBuildInputHash: failure.routeBuildInputHash,
      resolvedTraversalLockHash: failure.resolvedTraversalLockHash,
      graphBuilderProfileRef: failure.graphBuilderProfileRef,
      graphBuilderResolvedVersion: failure.graphBuilderResolvedVersion,
      graphBuilderProfileHash: failure.graphBuilderProfileHash,
    },
  };

  let traversalGraph: TraversalGraphV1 | undefined;
  let graphArtifactRef: string | undefined;
  if (connectivityResult.graphStatus === "complete") {
    traversalGraph = connectivityResult.traversalGraph;
    if (isNil(input.evidenceBytes.traversalGraph)) {
      fail("ROUTE_VALIDATION_GRAPH_EVIDENCE_BYTES_MISSING");
    }
    assertCanonicalEvidenceBytes(input.evidenceBytes.traversalGraph, traversalGraph);
    if (
      traversalGraph.authoringSpecHash !== input.subject.authoringSpecHash ||
      traversalGraph.layoutSolveReportHash !== input.subject.layoutSolveReportHash ||
      traversalGraph.resourceLockHash !== input.subject.resourceLockHash
    ) {
      fail("ROUTE_VALIDATION_WORLD_IDENTITY_MISMATCH");
    }
    const graphBase = evidenceBase(
      GRAPH_ARTIFACT_ID,
      "traversal-graph",
      failure.routeId,
      "traversal-graph.json",
      "application/vnd.worldkit.traversal-graph.v1+json",
      input.evidenceBytes.traversalGraph,
    );
    graphArtifactRef = graphBase.artifactRef;
    evidenceArtifactsById[GRAPH_ARTIFACT_ID] = {
      ...graphBase,
      kind: "traversal-graph",
      resolvedTraversalLockHash: traversalGraph.resolvedTraversalLockHash,
      graphBuilderProfileRef: traversalGraph.graphBuilderProfileRef,
      graphBuilderResolvedVersion: traversalGraph.graphBuilderResolvedVersion,
      graphBuilderProfileHash: traversalGraph.graphBuilderProfileHash,
    };
  } else if (!isNil(input.evidenceBytes.traversalGraph)) {
    fail("ROUTE_VALIDATION_GRAPH_EVIDENCE_ORPHANED");
  }

  if (!isNil(input.evidenceBytes.routeOverlay)) {
    evidenceArtifactsById[OVERLAY_ARTIFACT_ID] = {
      ...evidenceBase(
        OVERLAY_ARTIFACT_ID,
        "route-overlay",
        failure.routeId,
        "route-overlay.bin",
        "application/octet-stream",
        input.evidenceBytes.routeOverlay,
      ),
      kind: "route-overlay",
    };
  }
  const connectivity = createFailureConnectivityGate(
    connectivityDefinition,
    failure,
    traversalGraph,
    failureBase.artifactRef,
    graphArtifactRef,
    lockReceipt.lock,
  );
  const runtime = createUnavailableRuntimeGate(
    runtimeDefinition,
    failureDiagnosticContext(failure),
    artifactRef(failure.routeId, "route-path-receipt.json"),
    "route-path-unavailable",
  );
  const diagnostics = [...connectivity.diagnostics, ...runtime.diagnostics];
  const gateResultsById = {
    [CONNECTIVITY_GATE_ID]: connectivity.gate,
    [RUNTIME_GATE_ID]: runtime.gate,
  };
  return validateCompletedReport({
    kind: "worldkit-validation-report",
    schemaVersion: 2,
    id: input.reportId,
    subject: input.subject,
    dependencyReportRefs: [...(input.dependencyReportRefs ?? [])].sort(),
    validationProfileRef: profile.resourceRef,
    resolvedVersion: profile.version,
    validationProfileHash: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
    status: deriveValidationReportStatusV2(profile, gateResultsById),
    gateResultsById,
    evidenceArtifactsById,
    diagnostics,
  });
}

export function createRouteValidationReportV2(
  input: CreateRouteValidationReportInputV2,
): ValidationReportV2 {
  input = snapshotEvaluatorInput(input);
  const lockReceipt = input.resolvedTraversalLockReceipt;
  assertBuildInputWorldBindings(
    input.subject,
    input.routeBuildInputReceipt,
    lockReceipt,
  );
  const connectivityResult = input.routeConnectivityResult;
  if (connectivityResult.status !== "complete") {
    return createFailedConnectivityReport(input, connectivityResult, lockReceipt);
  }
  if (!isNil(input.evidenceBytes.routeConnectivityFailure)) {
    fail("ROUTE_VALIDATION_CONNECTIVITY_FAILURE_EVIDENCE_ORPHANED");
  }
  const traversalGraph = connectivityResult.traversalGraph;
  const routePathReceipt = connectivityResult.routePathReceipt;
  assertMatchingTraversalLocksV1(
    traversalGraph.resolvedTraversalLockHash,
    routePathReceipt.resolvedTraversalLockHash,
  );
  assertMatchingTraversalLocksV1(
    traversalGraph.resolvedTraversalLockHash,
    lockReceipt.resolvedTraversalLockHash,
  );
  assertWorldBindings(input.subject, traversalGraph, routePathReceipt, lockReceipt);
  if (
    isNil(input.evidenceBytes.traversalGraph) ||
    isNil(input.evidenceBytes.routePathReceipt)
  ) {
    fail("ROUTE_VALIDATION_CONNECTIVITY_EVIDENCE_BYTES_MISSING");
  }
  assertCanonicalEvidenceBytes(input.evidenceBytes.traversalGraph, traversalGraph);
  assertCanonicalEvidenceBytes(input.evidenceBytes.routePathReceipt, routePathReceipt);

  const graphBase = evidenceBase(
    GRAPH_ARTIFACT_ID,
    "traversal-graph",
    routePathReceipt.routeId,
    "traversal-graph.json",
    "application/vnd.worldkit.traversal-graph.v1+json",
    input.evidenceBytes.traversalGraph,
  );
  const pathBase = evidenceBase(
    PATH_ARTIFACT_ID,
    "route-path-receipt",
    routePathReceipt.routeId,
    "route-path-receipt.json",
    "application/vnd.worldkit.route-path-receipt.v1+json",
    input.evidenceBytes.routePathReceipt,
  );
  const evidenceArtifactsById: Record<string, EvidenceArtifactV2> = {
    [GRAPH_ARTIFACT_ID]: {
      ...graphBase,
      kind: "traversal-graph",
      resolvedTraversalLockHash: traversalGraph.resolvedTraversalLockHash,
      graphBuilderProfileRef: traversalGraph.graphBuilderProfileRef,
      graphBuilderResolvedVersion: traversalGraph.graphBuilderResolvedVersion,
      graphBuilderProfileHash: traversalGraph.graphBuilderProfileHash,
    },
    [PATH_ARTIFACT_ID]: {
      ...pathBase,
      kind: "route-path-receipt",
      resolvedTraversalLockHash: routePathReceipt.resolvedTraversalLockHash,
      graphBuilderProfileRef: routePathReceipt.graphBuilderProfileRef,
      graphBuilderResolvedVersion: routePathReceipt.graphBuilderResolvedVersion,
      graphBuilderProfileHash: routePathReceipt.graphBuilderProfileHash,
    },
  };

  if (!isNil(input.evidenceBytes.routeOverlay)) {
    evidenceArtifactsById[OVERLAY_ARTIFACT_ID] = {
      ...evidenceBase(
        OVERLAY_ARTIFACT_ID,
        "route-overlay",
        routePathReceipt.routeId,
        "route-overlay.bin",
        "application/octet-stream",
        input.evidenceBytes.routeOverlay,
      ),
      kind: "route-overlay",
    };
  }

  const profile = input.validationProfile;
  const connectivityDefinition = profile.gateDefinitionsById[CONNECTIVITY_GATE_ID];
  const runtimeDefinition = profile.gateDefinitionsById[RUNTIME_GATE_ID];
  if (isNil(connectivityDefinition) || isNil(runtimeDefinition)) {
    fail("ROUTE_VALIDATION_PROFILE_GATES_MISSING");
  }
  const connectivityGate = evaluatedGate(
    connectivityDefinition,
    connectivityMeasurements(
      traversalGraph,
      routePathReceipt,
      lockReceipt.lock,
      graphBase.artifactRef,
      pathBase.artifactRef,
    ),
  );

  const diagnostics: ValidationDiagnosticV2[] = [];
  let runtimeGate: GateResultV2;
  if (isNil(input.routeRuntimeProbeReceipt)) {
    if (!isNil(input.evidenceBytes.routeRuntimeProbeReceipt)) {
      fail("ROUTE_VALIDATION_PROBE_EVIDENCE_ORPHANED");
    }
    const metricResultsById = Object.fromEntries(
      Object.values(runtimeDefinition.metricDefinitionsById).map((definition) => {
        const metric = notEvaluatedMetric(definition);
        diagnostics.push(missingRuntimeDiagnostic(
          definition,
          pathDiagnosticContext(routePathReceipt),
          artifactRef(
            routePathReceipt.routeId,
            "route-runtime-probe-receipt.json",
          ),
          "runtime-probe-missing",
        ));
        return [definition.id, metric];
      }),
    );
    const diagnosticIds = diagnostics.map(({ id }) => id);
    const incompleteGate = {
      id: runtimeDefinition.id,
      requirement: runtimeDefinition.requirement,
      status: "incomplete" as const,
      metricResultsById,
      diagnosticIds,
    };
    runtimeGate = {
      ...incompleteGate,
      status: deriveValidationGateStatusV2(runtimeDefinition, incompleteGate),
    };
  } else {
    if (isNil(input.evidenceBytes.routeRuntimeProbeReceipt)) {
      fail("ROUTE_VALIDATION_PROBE_EVIDENCE_BYTES_MISSING");
    }
    const routeRuntimeProbeReceipt = canonicalRouteRuntimeProbeReceiptV1(
      input.routeRuntimeProbeReceipt,
    );
    assertMatchingTraversalLocksV1(
      traversalGraph.resolvedTraversalLockHash,
      routeRuntimeProbeReceipt.request.resolvedTraversalLockHash,
    );
    const driver = resolveTraversalDriverProfileV1(
      routeRuntimeProbeReceipt.request.driverProfileRef,
    );
    assertRouteRuntimeProbeReceiptContextV1({
      receipt: routeRuntimeProbeReceipt,
      routePathReceipt,
      resolvedDriverProfile: driver,
      validationProfileIdentity: {
        resourceRef: profile.resourceRef,
        version: profile.version,
        contentHash: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
      },
    });
    if (
      routeRuntimeProbeReceipt.request.executionPlanHash !==
        input.subject.executionPlanHash ||
      routeRuntimeProbeReceipt.request.runtimeImplementationIdentity.runtimeBackendRef !==
        lockReceipt.lock.runtimeBackendRef ||
      routeRuntimeProbeReceipt.request.runtimeImplementationIdentity.runtimeBackendResolvedVersion !==
        lockReceipt.lock.runtimeBackendResolvedVersion ||
      routeRuntimeProbeReceipt.request.runtimeImplementationIdentity.runtimeBackendHash !==
        lockReceipt.lock.runtimeBackendHash ||
      routeRuntimeProbeReceipt.request.runtimeImplementationIdentity.runtimeAdapterRef !==
        lockReceipt.lock.runtimeAdapterRef ||
      routeRuntimeProbeReceipt.request.runtimeImplementationIdentity.runtimeAdapterResolvedVersion !==
        lockReceipt.lock.runtimeAdapterResolvedVersion ||
      routeRuntimeProbeReceipt.request.runtimeImplementationIdentity.runtimeAdapterHash !==
        lockReceipt.lock.runtimeAdapterHash
    ) {
      fail("ROUTE_VALIDATION_RUNTIME_IDENTITY_MISMATCH");
    }
    assertCanonicalEvidenceBytes(
      input.evidenceBytes.routeRuntimeProbeReceipt,
      routeRuntimeProbeReceipt,
    );
    const probeBase = evidenceBase(
      PROBE_ARTIFACT_ID,
      "route-runtime-probe-receipt",
      routePathReceipt.routeId,
      "route-runtime-probe-receipt.json",
      "application/vnd.worldkit.route-runtime-probe-receipt.v1+json",
      input.evidenceBytes.routeRuntimeProbeReceipt,
    );
    evidenceArtifactsById[PROBE_ARTIFACT_ID] = {
      ...probeBase,
      kind: "route-runtime-probe-receipt",
      resolvedTraversalLockHash:
        routeRuntimeProbeReceipt.request.resolvedTraversalLockHash,
      driverProfileRef: routeRuntimeProbeReceipt.request.driverProfileRef,
      driverResolvedVersion: routeRuntimeProbeReceipt.request.driverResolvedVersion,
      driverProfileHash: routeRuntimeProbeReceipt.request.driverProfileHash,
      runtimeBackendRef:
        routeRuntimeProbeReceipt.request.runtimeImplementationIdentity.runtimeBackendRef,
      runtimeBackendResolvedVersion:
        routeRuntimeProbeReceipt.request.runtimeImplementationIdentity
          .runtimeBackendResolvedVersion,
      runtimeBackendHash:
        routeRuntimeProbeReceipt.request.runtimeImplementationIdentity.runtimeBackendHash,
      runtimeAdapterRef:
        routeRuntimeProbeReceipt.request.runtimeImplementationIdentity.runtimeAdapterRef,
      runtimeAdapterResolvedVersion:
        routeRuntimeProbeReceipt.request.runtimeImplementationIdentity
          .runtimeAdapterResolvedVersion,
      runtimeAdapterHash:
        routeRuntimeProbeReceipt.request.runtimeImplementationIdentity.runtimeAdapterHash,
    };
    const evaluated = evaluatedGate(
      runtimeDefinition,
      runtimeMeasurements(routeRuntimeProbeReceipt, probeBase.artifactRef),
    );
    if (routeRuntimeProbeReceipt.status === "failed") {
      const metricResultsById = Object.fromEntries(
        Object.entries(evaluated.metricResultsById).map(([metricId, metric]) => {
          if (metric.status !== "failed") return [metricId, metric];
          const diagnostic = runtimeFailureDiagnostic(
            metric,
            routePathReceipt,
            routeRuntimeProbeReceipt,
            probeBase.artifactRef,
          );
          diagnostics.push(diagnostic);
          return [metricId, { ...metric, diagnosticIds: [diagnostic.id] }];
        }),
      );
      const gateWithDiagnostics = {
        ...evaluated,
        metricResultsById,
        diagnosticIds: diagnostics.map(({ id }) => id),
      };
      runtimeGate = {
        ...gateWithDiagnostics,
        status: deriveValidationGateStatusV2(runtimeDefinition, gateWithDiagnostics),
      };
    } else {
      runtimeGate = evaluated;
    }
  }

  const gateResultsById = {
    [CONNECTIVITY_GATE_ID]: connectivityGate,
    [RUNTIME_GATE_ID]: runtimeGate,
  };
  const report: ValidationReportV2 = {
    kind: "worldkit-validation-report",
    schemaVersion: 2,
    id: input.reportId,
    subject: input.subject,
    dependencyReportRefs: [...(input.dependencyReportRefs ?? [])].sort(),
    validationProfileRef: profile.resourceRef,
    resolvedVersion: profile.version,
    validationProfileHash: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
    status: deriveValidationReportStatusV2(profile, gateResultsById),
    gateResultsById,
    evidenceArtifactsById,
    diagnostics,
  };
  return validateCompletedReport(report);
}
