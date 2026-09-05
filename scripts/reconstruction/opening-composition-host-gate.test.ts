import { parseFormalOpeningObservationV1 } from "@whitebox-world/runtime-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import { createEvidenceSetFixtureInputV1 } from "./evaluate-fixture.test-support.js";
import {
  createOpeningCompositionRepairDiagnosticsV1,
  evaluateOpeningCompositionHostGateV1,
} from "./opening-composition-host-gate.js";

function trackingObservation() {
  const fixture = createEvidenceSetFixtureInputV1({ allDimensionsPass: true });
  const resolvedParameters = {
    distanceMeters: 5,
    minimumDistanceMeters: 2,
    maximumDistanceMeters: 8,
    targetHeightMeters: 1.5,
    shoulderOffsetMeters: 0,
    pitchRadians: 0.2,
    minimumPitchRadians: -0.8,
    maximumPitchRadians: 0.6,
    positionDampingPerSecond: 12,
    horizontalPositionDampingPerSecond: 12,
    verticalPositionDampingPerSecond: 12,
    maximumPositionLagMeters: 2,
    rotationDampingPerSecond: 12,
    yawDampingPerSecond: 12,
    pitchDampingPerSecond: 12,
    collisionRadiusMeters: 0.2,
    collisionRetractionMetersPerSecond: 20,
    collisionRecoveryMetersPerSecond: 5,
    baseFovDegrees: 60,
    speedFovDegreesPerMeterPerSecond: 0,
    maximumSpeedFovDegrees: 8,
    lookAheadSeconds: 0,
    accelerationLookAheadSecondsSquared: 0,
    transitionSeconds: 0.2,
    minimumHeadingSpeedMetersPerSecond: 0.1,
    velocityHeadingDampingPerSecond: 10,
    fovDampingPerSecond: 10,
    horizontalDeadZoneRatio: 0,
    verticalDeadZoneRatio: 0,
    recenterDelaySeconds: 0,
    recenterDurationSeconds: 0.2,
    recenterMinimumSpeedMetersPerSecond: 0.1,
    teleportSnapDistanceMeters: 5,
    lookSensitivityXRatio: 1,
    lookSensitivityYRatio: 1,
  };
  const resetReadySnapshot = {
    ...fixture.openingObservation.resetReadySnapshot,
    view: {
      viewStateRevision: 0,
      camera: {
        mode: "tracking" as const,
        id: "sdk-camera",
        targetEntityId: "player",
        positionMetersXYZ: [0, 3, 5] as const,
        activeCameraProfileRef: "worldkit://camera-profile/orbit.medium@1",
        activeCameraRigRef: "worldkit://camera-rig/third-person@1",
        activeCameraModifierRefs: [],
        safeFallbackActive: false,
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
        fixedStepDeltaSeconds: 1 / 60,
        requestedArmLengthMeters: 5,
        safeArmLengthMeters: 5,
        effectiveArmLengthMeters: 5,
        isCollisionRetracted: false,
        finalFovDegrees: resolvedParameters.baseFovDegrees,
        resolvedParameters,
      },
    },
  };
  return {
    fixture,
    openingObservation: parseFormalOpeningObservationV1({
      ...fixture.openingObservation,
      resetReadySnapshot,
      resetReadySnapshotHash: sha256CanonicalJson(resetReadySnapshot),
    }),
  };
}

function expectedCamera() {
  return {
    distanceMeters: 5,
    pitchRadians: 0.2,
    fovDegrees: 60,
  } as const;
}

describe("identity-bound Opening Composition Host Gate", () => {
  it("does not turn matching visible pixels into drift when occluded structure has different bounds", () => {
    const { fixture, openingObservation } = trackingObservation();
    const result = evaluateOpeningCompositionHostGateV1({
      reconstructionCase: fixture.reconstructionCase,
      evaluationProfile: fixture.evaluationProfile,
      expectedCamera: expectedCamera(),
      openingPixelComposition: fixture.reconstructionCase.expected.openingComposition,
      openingObservation: parseFormalOpeningObservationV1({
        ...openingObservation,
        visualGroups: openingObservation.visualGroups.map((group) => ({
          ...group,
          normalizedBounds: { minXBasisPoints: 0, minYBasisPoints: 0, maxXBasisPoints: 10000, maxYBasisPoints: 10000 },
          normalizedCenter: { xBasisPoints: 5000, yBasisPoints: 5000 },
        })),
      }),
    });
    expect(result).toMatchObject({ status: "passed", diagnostics: [] });
  });

  it("reports absent visible pixels even when the target structural bounds match", () => {
    const { fixture, openingObservation } = trackingObservation();
    const result = evaluateOpeningCompositionHostGateV1({
      reconstructionCase: fixture.reconstructionCase,
      evaluationProfile: fixture.evaluationProfile,
      expectedCamera: expectedCamera(), openingObservation,
      openingPixelComposition: { regions: [], anchors: [] },
    });
    expect(result.status).toBe("failed");
    const diagnostics = createOpeningCompositionRepairDiagnosticsV1({
      priorAttemptIndex: 0, gateResult: result, reconstructionCase: fixture.reconstructionCase,
      evidenceRef: "artifact://case/package-fixture/attempts/0/rejected-capture/opening-composition-gate-result.json",
      semanticCaptureTargetBindings: fixture.formalCaptureIntent.semanticCaptureTargetBindings,
    });
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((diagnostic) => "repairAction" in diagnostic &&
      diagnostic.repairAction.operation === "adjust-geometry")).toBe(true);
  });

  it("accepts the fixed Case regions and an unretracted SDK camera", () => {
    const { fixture, openingObservation } = trackingObservation();
    expect(evaluateOpeningCompositionHostGateV1({
      reconstructionCase: fixture.reconstructionCase,
      evaluationProfile: fixture.evaluationProfile,
      openingObservation,
      openingPixelComposition: fixture.reconstructionCase.expected.openingComposition,
      expectedCamera: expectedCamera(),
    })).toMatchObject({ status: "passed", diagnostics: [] });
  });

  it("rejects a Runtime camera baseline that drifts from the frozen Package bootstrap", () => {
    const { fixture, openingObservation } = trackingObservation();
    const failed = evaluateOpeningCompositionHostGateV1({
      reconstructionCase: fixture.reconstructionCase,
      evaluationProfile: fixture.evaluationProfile,
      openingObservation,
      openingPixelComposition: fixture.reconstructionCase.expected.openingComposition,
      expectedCamera: {
        ...expectedCamera(),
        distanceMeters: 7,
        pitchRadians: -0.3,
        fovDegrees: 50,
      },
    });
    expect(failed.status).toBe("failed");
    expect(failed.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "WORLDKIT_OPENING_GATE_CAMERA_DISTANCE_DRIFT",
        "WORLDKIT_OPENING_GATE_PITCH_DRIFT",
        "WORLDKIT_OPENING_GATE_FOV_DRIFT",
      ]),
    );
  });

  it("fails closed when the tracking camera omits required Spring Arm collision telemetry", () => {
    const { fixture, openingObservation } = trackingObservation();
    const camera = openingObservation.resetReadySnapshot.view.camera;
    if (camera.mode !== "tracking") throw new Error("expected tracking camera");
    const {
      requestedArmLengthMeters: _requestedArmLengthMeters,
      effectiveArmLengthMeters: _effectiveArmLengthMeters,
      isCollisionRetracted: _isCollisionRetracted,
      ...cameraWithoutCollisionTelemetry
    } = camera;
    const resetReadySnapshot = {
      ...openingObservation.resetReadySnapshot,
      view: {
        ...openingObservation.resetReadySnapshot.view,
        camera: cameraWithoutCollisionTelemetry,
      },
    };
    const failed = evaluateOpeningCompositionHostGateV1({
      reconstructionCase: fixture.reconstructionCase,
      evaluationProfile: fixture.evaluationProfile,
      openingPixelComposition: fixture.reconstructionCase.expected.openingComposition,
      expectedCamera: expectedCamera(),
      openingObservation: parseFormalOpeningObservationV1({
        ...openingObservation,
        resetReadySnapshot,
        resetReadySnapshotHash: sha256CanonicalJson(resetReadySnapshot),
      }),
    });
    expect(failed.status).toBe("failed");
    expect(failed.diagnostics.map(({ code }) => code)).toContain(
      "WORLDKIT_OPENING_GATE_CAMERA_UNBOUND",
    );
  });

  it("rejects excessive arm shrink even when the collision flag is inconsistent", () => {
    const { fixture, openingObservation } = trackingObservation();
    const camera = openingObservation.resetReadySnapshot.view.camera;
    if (camera.mode !== "tracking") throw new Error("expected tracking camera");
    const resetReadySnapshot = {
      ...openingObservation.resetReadySnapshot,
      view: {
        ...openingObservation.resetReadySnapshot.view,
        camera: {
          ...camera,
          effectiveArmLengthMeters: 2,
          isCollisionRetracted: false,
        },
      },
    };
    const failed = evaluateOpeningCompositionHostGateV1({
      reconstructionCase: fixture.reconstructionCase,
      evaluationProfile: fixture.evaluationProfile,
      openingPixelComposition: fixture.reconstructionCase.expected.openingComposition,
      expectedCamera: expectedCamera(),
      openingObservation: parseFormalOpeningObservationV1({
        ...openingObservation,
        resetReadySnapshot,
        resetReadySnapshotHash: sha256CanonicalJson(resetReadySnapshot),
      }),
    });
    expect(failed.status).toBe("failed");
    expect(failed.diagnostics.map(({ code }) => code)).toContain(
      "WORLDKIT_OPENING_GATE_CAMERA_RETRACTED",
    );
  });

  it("centers the Subject on the required vertical centerline without forcing vertical screen center", () => {
    const { fixture, openingObservation } = trackingObservation();
    expect(evaluateOpeningCompositionHostGateV1({
      reconstructionCase: fixture.reconstructionCase,
      evaluationProfile: fixture.evaluationProfile,
      openingPixelComposition: fixture.reconstructionCase.expected.openingComposition,
      expectedCamera: expectedCamera(),
      openingObservation: parseFormalOpeningObservationV1({
        ...openingObservation,
        controlledSubjectProjection: {
          ...openingObservation.controlledSubjectProjection,
          centerXBasisPoints: 5_000,
          centerYBasisPoints: 7_500,
        },
      }),
    }).diagnostics.map(({ code }) => code)).not.toContain(
      "WORLDKIT_OPENING_GATE_SUBJECT_CENTER_DRIFT",
    );
  });

  it("fails before publication for a misplaced landmark or excessive camera shrink", () => {
    const { fixture, openingObservation } = trackingObservation();
    const camera = openingObservation.resetReadySnapshot.view.camera;
    if (camera.mode !== "tracking") throw new Error("tracking fixture");
    const failedSnapshot = {
      ...openingObservation.resetReadySnapshot,
      view: {
        ...openingObservation.resetReadySnapshot.view,
        camera: {
          ...camera,
          isCollisionRetracted: true,
          effectiveArmLengthMeters: 2,
        },
      },
    };
    const failed = evaluateOpeningCompositionHostGateV1({
      reconstructionCase: fixture.reconstructionCase,
      evaluationProfile: fixture.evaluationProfile,
      openingPixelComposition: {
        regions: fixture.reconstructionCase.expected.openingComposition.regions.map((region, index) => index === 0 ? {
          ...region, normalizedBounds: { minXBasisPoints: 0, minYBasisPoints: 0, maxXBasisPoints: 100, maxYBasisPoints: 100 },
        } : region),
        anchors: fixture.reconstructionCase.expected.openingComposition.anchors.map((anchor, index) => index === 0 ? {
          ...anchor, normalizedCenter: { xBasisPoints: 50, yBasisPoints: 50 },
        } : anchor),
      },
      expectedCamera: expectedCamera(),
      openingObservation: parseFormalOpeningObservationV1({
        ...openingObservation,
        controlledSubjectProjection: {
          ...openingObservation.controlledSubjectProjection,
          centerXBasisPoints: 1_000,
          widthBasisPoints: 50,
          heightBasisPoints: 500,
          coverageBasisPoints: 3,
        },
        visualGroups: openingObservation.visualGroups.map((group, index) =>
          index === 0
            ? {
                ...group,
                normalizedBounds: {
                  minXBasisPoints: 0,
                  minYBasisPoints: 0,
                  maxXBasisPoints: 100,
                  maxYBasisPoints: 100,
                },
                normalizedCenter: { xBasisPoints: 50, yBasisPoints: 50 },
                coverageBasisPoints: 1,
              }
            : group
        ),
        resetReadySnapshot: failedSnapshot,
        resetReadySnapshotHash: sha256CanonicalJson(failedSnapshot),
      }),
    });
    expect(failed.status).toBe("failed");
    expect(failed.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "WORLDKIT_OPENING_GATE_CAMERA_RETRACTED",
      "WORLDKIT_OPENING_GATE_SUBJECT_CENTER_DRIFT",
      "WORLDKIT_OPENING_GATE_SUBJECT_SCALE_INVALID",
      "WORLDKIT_OPENING_GATE_REGION_DRIFT",
      "WORLDKIT_OPENING_GATE_ANCHOR_DRIFT",
    ]));
    expect(failed.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "WORLDKIT_OPENING_GATE_REGION_DRIFT",
        targetRef: expect.stringMatching(/^worldkit:\/\/composition-target\//),
        metricId: expect.stringMatching(/^normalizedBounds\./),
        expectedValue: expect.any(Number),
        actualValue: expect.any(Number),
        allowedDeviation: expect.any(Number),
        exceededBy: expect.any(Number),
        correctionDirection: expect.stringMatching(/^(increase|decrease)$/),
      }),
      expect.objectContaining({
        code: "WORLDKIT_OPENING_GATE_ANCHOR_DRIFT",
        targetRef: expect.stringMatching(/^worldkit:\/\/composition-target\//),
        metricId: expect.stringMatching(/^normalizedCenter\./),
        expectedValue: expect.any(Number),
        actualValue: expect.any(Number),
        allowedDeviation: expect.any(Number),
        exceededBy: expect.any(Number),
        correctionDirection: expect.stringMatching(/^(increase|decrease)$/),
      }),
    ]));
    const shiftedTargetRef = openingObservation.visualGroups[0]
      ?.compositionTargetRef;
    expect(shiftedTargetRef).toBeDefined();
    expect(failed.diagnostics.filter((diagnostic) =>
      diagnostic.code === "WORLDKIT_OPENING_GATE_ANCHOR_DRIFT" &&
      diagnostic.targetRef === shiftedTargetRef
    ).map(({ metricId }) => metricId)).toEqual(expect.arrayContaining([
      "normalizedCenter.xBasisPoints",
      "normalizedCenter.yBasisPoints",
    ]));
  });

  it("converts source-owned visual drift into executable repair diagnostics", () => {
    const { fixture, openingObservation } = trackingObservation();
    const shifted = parseFormalOpeningObservationV1({
      ...openingObservation,
      visualGroups: openingObservation.visualGroups.map((group, index) =>
        index === 0
          ? {
              ...group,
              normalizedBounds: {
                ...group.normalizedBounds,
                minXBasisPoints: group.normalizedBounds.minXBasisPoints + 500,
                maxXBasisPoints: group.normalizedBounds.maxXBasisPoints + 500,
                minYBasisPoints: 0,
                maxYBasisPoints: 10_000,
              },
              normalizedCenter: {
                ...group.normalizedCenter,
                xBasisPoints: group.normalizedCenter.xBasisPoints + 500,
              },
            }
          : group),
    });
    const gateResult = evaluateOpeningCompositionHostGateV1({
      reconstructionCase: fixture.reconstructionCase,
      evaluationProfile: fixture.evaluationProfile,
      openingObservation: shifted,
      openingPixelComposition: {
        regions: shifted.visualGroups.map((group) => ({ targetRef: group.compositionTargetRef, normalizedBounds: group.normalizedBounds })),
        anchors: shifted.visualGroups.map((group) => ({ targetRef: group.compositionTargetRef, normalizedCenter: group.normalizedCenter })),
      },
      expectedCamera: expectedCamera(),
    });

    const diagnostics = createOpeningCompositionRepairDiagnosticsV1({
      priorAttemptIndex: 0,
      gateResult,
      reconstructionCase: fixture.reconstructionCase,
      evidenceRef:
        "artifact://case/package-fixture/attempts/0/rejected-capture/opening-composition-gate-result.json",
      semanticCaptureTargetBindings:
        fixture.formalCaptureIntent.semanticCaptureTargetBindings,
    });

    expect(gateResult.status).toBe("failed");
    const shiftedTargetRef = shifted.visualGroups[0]?.compositionTargetRef;
    expect(shiftedTargetRef).toBeDefined();
    expect(gateResult.diagnostics.filter((diagnostic) =>
      diagnostic.code === "WORLDKIT_OPENING_GATE_REGION_DRIFT" &&
      diagnostic.targetRef === shiftedTargetRef
    ).map(({ metricId }) => metricId)).toEqual(expect.arrayContaining([
      "normalizedBounds.minXBasisPoints",
      "normalizedBounds.minYBasisPoints",
      "normalizedBounds.maxXBasisPoints",
      "normalizedBounds.maxYBasisPoints",
    ]));
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
        targetId: "ground-group",
        repairAction: expect.objectContaining({
          kind: "revise-native-source",
          instruction: expect.stringContaining(
            "satisfy all four region edges and the anchor jointly",
          ),
        }),
      }),
    ]));
    expect(diagnostics.filter(({ metricId }) =>
      metricId.startsWith("opening-region-")
    ).every((diagnostic) =>
      "repairAction" in diagnostic &&
      diagnostic.repairAction.instruction.includes(
        "inputs/attempts/0/rejected-capture/opening-observation.json",
      )
    )).toBe(true);
  });
});
