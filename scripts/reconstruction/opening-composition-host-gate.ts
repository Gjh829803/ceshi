import type {
  FormalOpeningObservationV1,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import type {
  WorldReconstructionCaseV1,
  WorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import { isNil } from "lodash-es";

export const OPENING_COMPOSITION_HOST_GATE_DIAGNOSTIC_CODES_V1 = Object.freeze([
  "WORLDKIT_OPENING_GATE_CAMERA_UNBOUND",
  "WORLDKIT_OPENING_GATE_CAMERA_DISTANCE_DRIFT",
  "WORLDKIT_OPENING_GATE_CAMERA_RETRACTED",
  "WORLDKIT_OPENING_GATE_FOV_DRIFT",
  "WORLDKIT_OPENING_GATE_PITCH_DRIFT",
  "WORLDKIT_OPENING_GATE_SUBJECT_IDENTITY_MISMATCH",
  "WORLDKIT_OPENING_GATE_SUBJECT_CENTER_DRIFT",
  "WORLDKIT_OPENING_GATE_SUBJECT_SCALE_INVALID",
  "WORLDKIT_OPENING_GATE_TARGET_MISSING",
  "WORLDKIT_OPENING_GATE_REGION_DRIFT",
  "WORLDKIT_OPENING_GATE_ANCHOR_DRIFT",
  "WORLDKIT_OPENING_GATE_DEPTH_ORDER_DRIFT",
] as const);

export type OpeningCompositionHostGateDiagnosticCodeV1 =
  (typeof OPENING_COMPOSITION_HOST_GATE_DIAGNOSTIC_CODES_V1)[number];

export interface OpeningCompositionHostGateDiagnosticV1 {
  readonly code: OpeningCompositionHostGateDiagnosticCodeV1;
  readonly targetRef?: string;
  readonly metricId?: string;
  readonly expectedValue?: number;
  readonly actualValue?: number;
  readonly minimumAllowedValue?: number;
  readonly maximumAllowedValue?: number;
  readonly allowedDeviation?: number;
  readonly exceededBy?: number;
  readonly correctionDirection?: "increase" | "decrease" | "restore" | "reorder";
}

export interface OpeningCompositionHostGateResultV1 {
  readonly kind: "worldkit-opening-composition-host-gate";
  readonly schemaVersion: 1;
  readonly status: "passed" | "failed";
  readonly diagnostics: readonly OpeningCompositionHostGateDiagnosticV1[];
}

const MAXIMUM_CAMERA_RETRACTION_METERS = 0.75;
const MAXIMUM_CAMERA_RETRACTION_RATIO = 0.2;
const MAXIMUM_CAMERA_BASELINE_DRIFT = 1e-6;
const MAXIMUM_FOV_DRIFT_DEGREES = 3;
const MAXIMUM_PITCH_DRIFT_RADIANS = 0.15;
const MAXIMUM_SUBJECT_CENTER_DRIFT_BASIS_POINTS = 1_200;
const MINIMUM_SUBJECT_COVERAGE_BASIS_POINTS = 50;
const MAXIMUM_SUBJECT_COVERAGE_BASIS_POINTS = 2_500;
const MINIMUM_SUBJECT_HEIGHT_BASIS_POINTS = 1_200;
const MAXIMUM_SUBJECT_HEIGHT_BASIS_POINTS = 9_000;

function boundsDrift(
  expected: Readonly<Record<"minXBasisPoints" | "minYBasisPoints" | "maxXBasisPoints" | "maxYBasisPoints", number>>,
  observed: Readonly<Record<"minXBasisPoints" | "minYBasisPoints" | "maxXBasisPoints" | "maxYBasisPoints", number>>,
): Readonly<{
  metricId: keyof typeof expected;
  expectedValue: number;
  actualValue: number;
  deviation: number;
  correctionDirection: "increase" | "decrease";
}> {
  const rows = ([
    "minXBasisPoints",
    "minYBasisPoints",
    "maxXBasisPoints",
    "maxYBasisPoints",
  ] as const).map((metricId) => ({
    metricId,
    expectedValue: expected[metricId],
    actualValue: observed[metricId],
    deviation: Math.abs(expected[metricId] - observed[metricId]),
    correctionDirection: observed[metricId] < expected[metricId]
      ? "increase" as const
      : "decrease" as const,
  }));
  return rows.reduce((maximum, row) =>
    row.deviation > maximum.deviation ? row : maximum);
}

function centerDrift(
  expected: Readonly<{ xBasisPoints: number; yBasisPoints: number }>,
  observed: Readonly<{ xBasisPoints: number; yBasisPoints: number }>,
): number {
  return Math.round(Math.hypot(
    expected.xBasisPoints - observed.xBasisPoints,
    expected.yBasisPoints - observed.yBasisPoints,
  ));
}

function cameraDiagnostics(
  snapshot: WorldRuntimeSnapshotV4,
  expectedCamera: Readonly<{
    distanceMeters: number;
    pitchRadians: number;
    fovDegrees: number;
  }>,
): OpeningCompositionHostGateDiagnosticV1[] {
  const camera = snapshot.view.camera;
  if (
    camera.mode !== "tracking" ||
    isNil(camera.resolvedParameters) ||
    isNil(camera.requestedArmLengthMeters) ||
    isNil(camera.effectiveArmLengthMeters) ||
    isNil(camera.isCollisionRetracted)
  ) {
    return [{ code: "WORLDKIT_OPENING_GATE_CAMERA_UNBOUND" }];
  }
  const diagnostics: OpeningCompositionHostGateDiagnosticV1[] = [];
  const requestedArm = camera.requestedArmLengthMeters;
  const distanceDrift = Math.max(
    Math.abs(
      camera.resolvedParameters.distanceMeters - expectedCamera.distanceMeters,
    ),
    Math.abs(requestedArm - expectedCamera.distanceMeters),
  );
  if (distanceDrift > MAXIMUM_CAMERA_BASELINE_DRIFT) {
    diagnostics.push({
      code: "WORLDKIT_OPENING_GATE_CAMERA_DISTANCE_DRIFT",
      metricId: "camera.distanceDriftMeters",
      expectedValue: 0,
      actualValue: distanceDrift,
      maximumAllowedValue: MAXIMUM_CAMERA_BASELINE_DRIFT,
      exceededBy: distanceDrift - MAXIMUM_CAMERA_BASELINE_DRIFT,
      correctionDirection: "restore",
    });
  }
  const effectiveArm = camera.effectiveArmLengthMeters;
  const retraction = Math.max(0, requestedArm - effectiveArm);
  const maximumRetraction = Math.min(
    MAXIMUM_CAMERA_RETRACTION_METERS,
    requestedArm * MAXIMUM_CAMERA_RETRACTION_RATIO,
  );
  if (retraction > maximumRetraction) {
    diagnostics.push({
      code: "WORLDKIT_OPENING_GATE_CAMERA_RETRACTED",
      metricId: "camera.retractionMeters",
      expectedValue: 0,
      actualValue: retraction,
      maximumAllowedValue: maximumRetraction,
      exceededBy: retraction - maximumRetraction,
      correctionDirection: "restore",
    });
  }
  const fovDrift = Math.abs(
    (camera.finalFovDegrees ?? camera.resolvedParameters.baseFovDegrees) -
      expectedCamera.fovDegrees,
  );
  const baseFovDrift = Math.abs(
    camera.resolvedParameters.baseFovDegrees - expectedCamera.fovDegrees,
  );
  const maximumFovDrift = Math.max(fovDrift, baseFovDrift);
  if (maximumFovDrift > MAXIMUM_FOV_DRIFT_DEGREES) {
    diagnostics.push({
      code: "WORLDKIT_OPENING_GATE_FOV_DRIFT",
      metricId: "camera.fovDriftDegrees",
      expectedValue: 0,
      actualValue: maximumFovDrift,
      maximumAllowedValue: MAXIMUM_FOV_DRIFT_DEGREES,
      exceededBy: maximumFovDrift - MAXIMUM_FOV_DRIFT_DEGREES,
      correctionDirection: "restore",
    });
  }
  const pitchDrift = Math.max(
    Math.abs(
      camera.resolvedParameters.pitchRadians - expectedCamera.pitchRadians,
    ),
    Math.abs(camera.viewPitchOffsetRadians),
  );
  if (pitchDrift > MAXIMUM_PITCH_DRIFT_RADIANS) {
    diagnostics.push({
      code: "WORLDKIT_OPENING_GATE_PITCH_DRIFT",
      metricId: "camera.pitchDriftRadians",
      expectedValue: 0,
      actualValue: pitchDrift,
      maximumAllowedValue: MAXIMUM_PITCH_DRIFT_RADIANS,
      exceededBy: pitchDrift - MAXIMUM_PITCH_DRIFT_RADIANS,
      correctionDirection: "restore",
    });
  }
  return diagnostics;
}

function controlledSubjectDiagnostics(
  openingObservation: FormalOpeningObservationV1,
): OpeningCompositionHostGateDiagnosticV1[] {
  const projection = openingObservation.controlledSubjectProjection;
  const camera = openingObservation.resetReadySnapshot.view.camera;
  const diagnostics: OpeningCompositionHostGateDiagnosticV1[] = [];
  if (
    camera.mode !== "tracking" ||
    camera.targetEntityId !== projection.subjectEntityId
  ) {
    diagnostics.push({
      code: "WORLDKIT_OPENING_GATE_SUBJECT_IDENTITY_MISMATCH",
      targetRef: projection.subjectEntityId,
    });
  }
  const centerDriftBasisPoints = Math.abs(
    projection.centerXBasisPoints - 5_000,
  );
  if (centerDriftBasisPoints > MAXIMUM_SUBJECT_CENTER_DRIFT_BASIS_POINTS) {
    diagnostics.push({
      code: "WORLDKIT_OPENING_GATE_SUBJECT_CENTER_DRIFT",
      targetRef: projection.subjectEntityId,
      metricId: "controlledSubjectProjection.centerXBasisPoints",
      expectedValue: 5_000,
      actualValue: projection.centerXBasisPoints,
      allowedDeviation: MAXIMUM_SUBJECT_CENTER_DRIFT_BASIS_POINTS,
      exceededBy:
        centerDriftBasisPoints - MAXIMUM_SUBJECT_CENTER_DRIFT_BASIS_POINTS,
      correctionDirection: projection.centerXBasisPoints < 5_000
        ? "increase"
        : "decrease",
    });
  }
  if (
    projection.coverageBasisPoints < MINIMUM_SUBJECT_COVERAGE_BASIS_POINTS ||
    projection.coverageBasisPoints > MAXIMUM_SUBJECT_COVERAGE_BASIS_POINTS
  ) {
    diagnostics.push({
      code: "WORLDKIT_OPENING_GATE_SUBJECT_SCALE_INVALID",
      targetRef: projection.subjectEntityId,
      metricId: "controlledSubjectProjection.coverageBasisPoints",
      actualValue: projection.coverageBasisPoints,
      minimumAllowedValue: MINIMUM_SUBJECT_COVERAGE_BASIS_POINTS,
      maximumAllowedValue: MAXIMUM_SUBJECT_COVERAGE_BASIS_POINTS,
      exceededBy: projection.coverageBasisPoints <
          MINIMUM_SUBJECT_COVERAGE_BASIS_POINTS
        ? MINIMUM_SUBJECT_COVERAGE_BASIS_POINTS -
          projection.coverageBasisPoints
        : projection.coverageBasisPoints -
          MAXIMUM_SUBJECT_COVERAGE_BASIS_POINTS,
      correctionDirection: projection.coverageBasisPoints <
          MINIMUM_SUBJECT_COVERAGE_BASIS_POINTS
        ? "increase"
        : "decrease",
    });
  }
  if (
    projection.heightBasisPoints < MINIMUM_SUBJECT_HEIGHT_BASIS_POINTS ||
    projection.heightBasisPoints > MAXIMUM_SUBJECT_HEIGHT_BASIS_POINTS
  ) {
    diagnostics.push({
      code: "WORLDKIT_OPENING_GATE_SUBJECT_SCALE_INVALID",
      targetRef: projection.subjectEntityId,
      metricId: "controlledSubjectProjection.heightBasisPoints",
      actualValue: projection.heightBasisPoints,
      minimumAllowedValue: MINIMUM_SUBJECT_HEIGHT_BASIS_POINTS,
      maximumAllowedValue: MAXIMUM_SUBJECT_HEIGHT_BASIS_POINTS,
      exceededBy: projection.heightBasisPoints <
          MINIMUM_SUBJECT_HEIGHT_BASIS_POINTS
        ? MINIMUM_SUBJECT_HEIGHT_BASIS_POINTS - projection.heightBasisPoints
        : projection.heightBasisPoints - MAXIMUM_SUBJECT_HEIGHT_BASIS_POINTS,
      correctionDirection: projection.heightBasisPoints <
          MINIMUM_SUBJECT_HEIGHT_BASIS_POINTS
        ? "increase"
        : "decrease",
    });
  }
  return diagnostics;
}

export function evaluateOpeningCompositionHostGateV1(input: Readonly<{
  reconstructionCase: WorldReconstructionCaseV1;
  evaluationProfile: WorldReconstructionEvaluationProfileV1;
  openingObservation: FormalOpeningObservationV1;
  expectedCamera: Readonly<{
    distanceMeters: number;
    pitchRadians: number;
    fovDegrees: number;
  }>;
}>): OpeningCompositionHostGateResultV1 {
  const diagnostics = cameraDiagnostics(
    input.openingObservation.resetReadySnapshot,
    input.expectedCamera,
  );
  diagnostics.push(...controlledSubjectDiagnostics(input.openingObservation));
  const expected = input.reconstructionCase.expected.openingComposition;
  const observedByTargetRef = new Map(
    input.openingObservation.visualGroups.map((group) =>
      [group.compositionTargetRef, group] as const),
  );
  for (const region of expected.regions) {
    const observed = observedByTargetRef.get(region.targetRef);
    const threshold = input.evaluationProfile.thresholds.openingComposition
      .regions.find(({ targetRef }) => targetRef === region.targetRef);
    if (isNil(observed) || isNil(threshold)) {
      diagnostics.push({
        code: "WORLDKIT_OPENING_GATE_TARGET_MISSING",
        targetRef: region.targetRef,
      });
      continue;
    }
    const drift = boundsDrift(region.normalizedBounds, observed.normalizedBounds);
    if (drift.deviation > threshold.maximumDriftBasisPoints) {
      diagnostics.push({
        code: "WORLDKIT_OPENING_GATE_REGION_DRIFT",
        targetRef: region.targetRef,
        metricId: `normalizedBounds.${drift.metricId}`,
        expectedValue: drift.expectedValue,
        actualValue: drift.actualValue,
        allowedDeviation: threshold.maximumDriftBasisPoints,
        exceededBy: drift.deviation - threshold.maximumDriftBasisPoints,
        correctionDirection: drift.correctionDirection,
      });
    }
  }
  for (const anchor of expected.anchors) {
    const observed = observedByTargetRef.get(anchor.targetRef);
    const threshold = input.evaluationProfile.thresholds.openingComposition
      .anchors.find(({ targetRef }) => targetRef === anchor.targetRef);
    if (isNil(observed) || isNil(threshold)) {
      diagnostics.push({
        code: "WORLDKIT_OPENING_GATE_TARGET_MISSING",
        targetRef: anchor.targetRef,
      });
      continue;
    }
    const drift = centerDrift(anchor.normalizedCenter, observed.normalizedCenter);
    if (drift > threshold.maximumDriftBasisPoints) {
      const deltaX = Math.abs(
        anchor.normalizedCenter.xBasisPoints -
          observed.normalizedCenter.xBasisPoints,
      );
      const metricId = deltaX >= Math.abs(
          anchor.normalizedCenter.yBasisPoints -
            observed.normalizedCenter.yBasisPoints,
        )
        ? "xBasisPoints" as const
        : "yBasisPoints" as const;
      const expectedValue = anchor.normalizedCenter[metricId];
      const actualValue = observed.normalizedCenter[metricId];
      diagnostics.push({
        code: "WORLDKIT_OPENING_GATE_ANCHOR_DRIFT",
        targetRef: anchor.targetRef,
        metricId: `normalizedCenter.${metricId}`,
        expectedValue,
        actualValue,
        allowedDeviation: threshold.maximumDriftBasisPoints,
        exceededBy: drift - threshold.maximumDriftBasisPoints,
        correctionDirection: actualValue < expectedValue
          ? "increase"
          : "decrease",
      });
    }
  }
  const observedOrder = [...input.openingObservation.visualGroups]
    .sort((left, right) => left.depthOrder - right.depthOrder)
    .map(({ compositionTargetRef }) => compositionTargetRef);
  if (
    observedOrder.length !== expected.orderedTargetRefs.length ||
    expected.orderedTargetRefs.some((targetRef, index) =>
      targetRef !== observedOrder[index])
  ) {
    diagnostics.push({
      code: "WORLDKIT_OPENING_GATE_DEPTH_ORDER_DRIFT",
      metricId: "visualGroups.depthOrder",
      correctionDirection: "reorder",
    });
  }
  return Object.freeze({
    kind: "worldkit-opening-composition-host-gate",
    schemaVersion: 1,
    status: diagnostics.length === 0 ? "passed" : "failed",
    diagnostics: Object.freeze(diagnostics.map((diagnostic) =>
      Object.freeze({ ...diagnostic })
    )),
  });
}

export function assertOpeningCompositionHostGateV1(input: Parameters<
  typeof evaluateOpeningCompositionHostGateV1
>[0]): OpeningCompositionHostGateResultV1 {
  const result = evaluateOpeningCompositionHostGateV1(input);
  if (result.status === "failed") {
    throw new Error(
      `FORMAL_CAPTURE_OPENING_COMPOSITION_GATE_FAILED:${result.diagnostics
        .map(({ code }) => code).join(",")}`,
    );
  }
  return result;
}
