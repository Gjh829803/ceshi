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
  readonly measuredValue?: number;
  readonly minimumValue?: number;
  readonly maximumValue?: number;
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
): number {
  return Math.max(
    Math.abs(expected.minXBasisPoints - observed.minXBasisPoints),
    Math.abs(expected.minYBasisPoints - observed.minYBasisPoints),
    Math.abs(expected.maxXBasisPoints - observed.maxXBasisPoints),
    Math.abs(expected.maxYBasisPoints - observed.maxYBasisPoints),
  );
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
      measuredValue: distanceDrift,
      maximumValue: MAXIMUM_CAMERA_BASELINE_DRIFT,
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
      measuredValue: retraction,
      maximumValue: maximumRetraction,
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
      measuredValue: maximumFovDrift,
      maximumValue: MAXIMUM_FOV_DRIFT_DEGREES,
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
      measuredValue: pitchDrift,
      maximumValue: MAXIMUM_PITCH_DRIFT_RADIANS,
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
      measuredValue: centerDriftBasisPoints,
      maximumValue: MAXIMUM_SUBJECT_CENTER_DRIFT_BASIS_POINTS,
    });
  }
  if (
    projection.coverageBasisPoints < MINIMUM_SUBJECT_COVERAGE_BASIS_POINTS ||
    projection.coverageBasisPoints > MAXIMUM_SUBJECT_COVERAGE_BASIS_POINTS ||
    projection.heightBasisPoints < MINIMUM_SUBJECT_HEIGHT_BASIS_POINTS ||
    projection.heightBasisPoints > MAXIMUM_SUBJECT_HEIGHT_BASIS_POINTS
  ) {
    diagnostics.push({
      code: "WORLDKIT_OPENING_GATE_SUBJECT_SCALE_INVALID",
      targetRef: projection.subjectEntityId,
      measuredValue: projection.coverageBasisPoints,
      minimumValue: MINIMUM_SUBJECT_COVERAGE_BASIS_POINTS,
      maximumValue: MAXIMUM_SUBJECT_COVERAGE_BASIS_POINTS,
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
    if (drift > threshold.maximumDriftBasisPoints) {
      diagnostics.push({
        code: "WORLDKIT_OPENING_GATE_REGION_DRIFT",
        targetRef: region.targetRef,
        measuredValue: drift,
        maximumValue: threshold.maximumDriftBasisPoints,
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
      diagnostics.push({
        code: "WORLDKIT_OPENING_GATE_ANCHOR_DRIFT",
        targetRef: anchor.targetRef,
        measuredValue: drift,
        maximumValue: threshold.maximumDriftBasisPoints,
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
    diagnostics.push({ code: "WORLDKIT_OPENING_GATE_DEPTH_ORDER_DRIFT" });
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
