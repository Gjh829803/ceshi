import type {
  FormalOpeningObservationV1,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import type {
  WorldReconstructionAttemptIndexV1,
  WorldReconstructionCaseV1,
  WorldReconstructionDiagnosticV1,
  WorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import { parseWorldReconstructionDiagnosticV1 } from "@whitebox-world/validation";
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
  readonly expectedValues?: readonly string[];
  readonly actualValues?: readonly string[];
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

function boundsDrifts(
  expected: Readonly<Record<"minXBasisPoints" | "minYBasisPoints" | "maxXBasisPoints" | "maxYBasisPoints", number>>,
  observed: Readonly<Record<"minXBasisPoints" | "minYBasisPoints" | "maxXBasisPoints" | "maxYBasisPoints", number>>,
): readonly Readonly<{
  metricId: keyof typeof expected;
  expectedValue: number;
  actualValue: number;
  deviation: number;
  correctionDirection: "increase" | "decrease";
}>[] {
  return Object.freeze(([
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
  })));
}

function centerDrifts(
  expected: Readonly<{ xBasisPoints: number; yBasisPoints: number }>,
  observed: Readonly<{ xBasisPoints: number; yBasisPoints: number }>,
): readonly Readonly<{
  metricId: "xBasisPoints" | "yBasisPoints";
  expectedValue: number;
  actualValue: number;
  deviation: number;
  correctionDirection: "increase" | "decrease";
}>[] {
  return Object.freeze((["xBasisPoints", "yBasisPoints"] as const).map(
    (metricId) => ({
      metricId,
      expectedValue: expected[metricId],
      actualValue: observed[metricId],
      deviation: Math.abs(expected[metricId] - observed[metricId]),
      correctionDirection: observed[metricId] < expected[metricId]
        ? "increase" as const
        : "decrease" as const,
    }),
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
  const expectedTargetRefs = new Set(expected.targetRefs);
  const observedByTargetRef = new Map(
    input.openingObservation.visualGroups
      .filter(({ compositionTargetRef }) =>
        expectedTargetRefs.has(compositionTargetRef))
      .map((group) =>
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
        metricId: "normalizedBounds.presence",
        correctionDirection: "restore",
      });
      continue;
    }
    for (const drift of boundsDrifts(
      region.normalizedBounds,
      observed.normalizedBounds,
    )) {
      if (drift.deviation <= threshold.maximumDriftBasisPoints) continue;
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
        metricId: "normalizedCenter.presence",
        correctionDirection: "restore",
      });
      continue;
    }
    for (const drift of centerDrifts(
      anchor.normalizedCenter,
      observed.normalizedCenter,
    )) {
      if (drift.deviation <= threshold.maximumDriftBasisPoints) continue;
      diagnostics.push({
        code: "WORLDKIT_OPENING_GATE_ANCHOR_DRIFT",
        targetRef: anchor.targetRef,
        metricId: `normalizedCenter.${drift.metricId}`,
        expectedValue: drift.expectedValue,
        actualValue: drift.actualValue,
        allowedDeviation: threshold.maximumDriftBasisPoints,
        exceededBy: drift.deviation - threshold.maximumDriftBasisPoints,
        correctionDirection: drift.correctionDirection,
      });
    }
  }
  const observedOrder = [...input.openingObservation.visualGroups]
    .filter(({ compositionTargetRef }) =>
      expectedTargetRefs.has(compositionTargetRef))
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
      expectedValues: Object.freeze([...expected.orderedTargetRefs]),
      actualValues: Object.freeze([...observedOrder]),
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

const OPENING_REGION_METRIC_ID_BY_GATE_METRIC_ID = Object.freeze({
  "normalizedBounds.minXBasisPoints": "opening-region-min-x-basis-points",
  "normalizedBounds.minYBasisPoints": "opening-region-min-y-basis-points",
  "normalizedBounds.maxXBasisPoints": "opening-region-max-x-basis-points",
  "normalizedBounds.maxYBasisPoints": "opening-region-max-y-basis-points",
} as const);

/**
 * Converts only source-repairable Opening Gate failures into the stable WRC
 * diagnostic contract. An empty result means the whole rejection must remain
 * fail-closed; partial repair instructions are never emitted.
 */
export function createOpeningCompositionRepairDiagnosticsV1(input: Readonly<{
  gateResult: OpeningCompositionHostGateResultV1;
  reconstructionCase: WorldReconstructionCaseV1;
  evidenceRef: string;
  priorAttemptIndex: WorldReconstructionAttemptIndexV1;
  semanticCaptureTargetBindings: readonly Readonly<{
    acceptanceTargetRef: string;
    compositionTargetRef: string;
    blockVisualGroupId: string;
  }>[];
}>): readonly WorldReconstructionDiagnosticV1[] {
  if (input.gateResult.status !== "failed") return Object.freeze([]);
  const bindingByTargetRef = new Map(
    input.semanticCaptureTargetBindings.map((binding) =>
      [binding.compositionTargetRef, binding] as const),
  );
  const openingObservationInputPath =
    `inputs/attempts/${input.priorAttemptIndex}/rejected-capture/opening-observation.json`;
  const converted: WorldReconstructionDiagnosticV1[] = [];
  for (const [index, diagnostic] of input.gateResult.diagnostics.entries()) {
    if (diagnostic.code === "WORLDKIT_OPENING_GATE_DEPTH_ORDER_DRIFT") {
      if (
        isNil(diagnostic.expectedValues) ||
        isNil(diagnostic.actualValues)
      ) return Object.freeze([]);
      converted.push(parseWorldReconstructionDiagnosticV1({
        kind: "world-reconstruction-diagnostic",
        schemaVersion: 1,
        id: `opening-gate-${index}-target-order`,
        code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
        dimensionId: "opening-composition",
        acceptanceTargetRef:
          input.reconstructionCase.expected.openingComposition
            .acceptanceTargetRef,
        targetRef:
          input.reconstructionCase.expected.openingComposition
            .acceptanceTargetRef,
        targetId: "opening-composition",
        metricId: "opening-target-order",
        details: {
          kind: "sequence-mismatch",
          expectedValues: diagnostic.expectedValues,
          actualValues: diagnostic.actualValues,
          correctionDirection: "reorder",
        },
        evidenceRefs: [input.evidenceRef],
        message: "Opening composition target depth order does not match the frozen Case.",
        repairAction: {
          kind: "revise-native-source",
          targetKind: "composition-target",
          targetId: "opening-composition",
          operation: "reorder",
          instruction: "Move the actual Blocks of the named visual groups forward or backward until their observed depth order matches expectedValues; do not relabel unchanged geometry or edit thresholds.",
        },
      }));
      continue;
    }
    if (isNil(diagnostic.targetRef)) return Object.freeze([]);
    const binding = bindingByTargetRef.get(diagnostic.targetRef);
    if (isNil(binding)) return Object.freeze([]);
    if (diagnostic.code === "WORLDKIT_OPENING_GATE_TARGET_MISSING") {
      const metricId = diagnostic.metricId === "normalizedBounds.presence"
        ? "opening-region-presence"
        : diagnostic.metricId === "normalizedCenter.presence"
          ? "opening-anchor-presence"
          : undefined;
      if (isNil(metricId)) return Object.freeze([]);
      converted.push(parseWorldReconstructionDiagnosticV1({
        kind: "world-reconstruction-diagnostic",
        schemaVersion: 1,
        id: `opening-gate-${index}-${metricId}-${binding.blockVisualGroupId}`,
        code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
        dimensionId: "opening-composition",
        acceptanceTargetRef: binding.acceptanceTargetRef,
        targetRef: binding.compositionTargetRef,
        targetId: binding.blockVisualGroupId,
        metricId,
        details: {
          kind: "presence-mismatch",
          expectedValue: "present",
          actualValue: "missing",
          correctionDirection: "add",
        },
        evidenceRefs: [input.evidenceRef],
        message: `Opening composition target ${binding.compositionTargetRef} is missing from the captured view.`,
        repairAction: {
          kind: "revise-native-source",
          targetKind: "composition-target",
          targetId: binding.blockVisualGroupId,
          operation: "add",
          instruction: `Add visible Blocks to visual group ${binding.blockVisualGroupId} so ${binding.compositionTargetRef} appears in the opening view; do not edit thresholds or substitute metadata.`,
        },
      }));
      continue;
    }
    const metricId = diagnostic.code === "WORLDKIT_OPENING_GATE_REGION_DRIFT"
      ? OPENING_REGION_METRIC_ID_BY_GATE_METRIC_ID[
        diagnostic.metricId as keyof typeof OPENING_REGION_METRIC_ID_BY_GATE_METRIC_ID
      ]
      : diagnostic.code === "WORLDKIT_OPENING_GATE_ANCHOR_DRIFT"
        ? diagnostic.metricId === "normalizedCenter.xBasisPoints"
          ? "opening-anchor-x-basis-points"
          : diagnostic.metricId === "normalizedCenter.yBasisPoints"
            ? "opening-anchor-y-basis-points"
            : undefined
        : undefined;
    if (
      isNil(metricId) ||
      isNil(diagnostic.expectedValue) ||
      isNil(diagnostic.actualValue) ||
      isNil(diagnostic.allowedDeviation) ||
      isNil(diagnostic.exceededBy) ||
      (diagnostic.correctionDirection !== "increase" &&
        diagnostic.correctionDirection !== "decrease")
    ) return Object.freeze([]);
    const isRegionDrift = diagnostic.code ===
      "WORLDKIT_OPENING_GATE_REGION_DRIFT";
    const operation = isRegionDrift
      ? "resize" as const
      : "move" as const;
    const jointConstraintInstruction = isRegionDrift
      ? `Read the complete expected region bounds and anchor for this target from context/case.json and the complete observed normalizedBounds and normalizedCenter from ${openingObservationInputPath}; satisfy all four region edges and the anchor jointly, including axes that currently pass. If a projected edge is clipped at 0 or 10000, adjust near-camera footprint/depth and height together instead of trading one screen edge or center for another.`
      : `Read the complete expected region bounds and anchor for this target from context/case.json and the complete observed normalizedBounds and normalizedCenter from ${openingObservationInputPath}; satisfy the anchor and all four region edges jointly, including axes that currently pass. Do not move the center by pushing any screen edge outside its allowed envelope.`;
    converted.push(parseWorldReconstructionDiagnosticV1({
      kind: "world-reconstruction-diagnostic",
      schemaVersion: 1,
      id: `opening-gate-${index}-${metricId}-${binding.blockVisualGroupId}`,
      code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
      dimensionId: "opening-composition",
      acceptanceTargetRef: binding.acceptanceTargetRef,
      targetRef: binding.compositionTargetRef,
      targetId: binding.blockVisualGroupId,
      metricId,
      details: {
        kind: "basis-points-threshold",
        expectedBasisPoints: diagnostic.expectedValue,
        actualBasisPoints: diagnostic.actualValue,
        maximumAllowedDriftBasisPoints: diagnostic.allowedDeviation,
        exceededByBasisPoints: diagnostic.exceededBy,
        correctionDirection: diagnostic.correctionDirection,
      },
      evidenceRefs: [input.evidenceRef],
      message: `${binding.compositionTargetRef} ${metricId} is ${diagnostic.actualValue}; target ${diagnostic.expectedValue}, allowed drift ${diagnostic.allowedDeviation}, exceeded by ${diagnostic.exceededBy}.`,
      repairAction: {
        kind: "revise-native-source",
        targetKind: "composition-target",
        targetId: binding.blockVisualGroupId,
        operation,
        instruction: `${diagnostic.correctionDirection === "increase" ? "Increase" : "Decrease"} ${metricId} for the actual Blocks in visual group ${binding.blockVisualGroupId} toward ${diagnostic.expectedValue}; keep drift within ${diagnostic.allowedDeviation}. ${jointConstraintInstruction} Do not relabel unchanged geometry, change the frozen Camera, or edit thresholds.`,
      },
    }));
  }
  return Object.freeze(converted);
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
