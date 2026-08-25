import { describe, expect, it } from "vitest";
import {
  admitCameraContextProfileV1,
  admitCameraViewPreferenceV1,
  selectCameraViewV1,
  type CameraContextProfileV1,
  type CameraContextRuleV2,
  type CameraContextSampleV1,
  type CameraModifierProfileV1,
  type CameraRigParametersV1,
  type CameraRigProfileV1,
} from "./index.js";

const DEFAULT_RIG_REF = "worldkit://camera-profile/follow.medium@1";
const FIRST_PERSON_RIG_REF =
  "worldkit://camera-profile/first-person.standard@1";
const FLIGHT_RIG_REF = "worldkit://camera-profile/flight.horizon@1";

function rig(
  cameraRigProfileRef: string,
  baseMode: CameraRigProfileV1["baseMode"] = "stable-follow",
): CameraRigProfileV1 {
  return {
    cameraRigProfileRef,
    algorithmRef: `worldkit://camera-rig/${baseMode}@1`,
    baseMode,
    headingSource: "target-forward",
    reverseHeadingPolicy: "preserve-target-forward",
    recenterMode: "forward-motion",
    preferredSocketIds: [],
    parameters: parameters(),
  };
}

function parameters(): CameraRigParametersV1 {
  return {
    distanceMeters: 5,
    minimumDistanceMeters: 1,
    maximumDistanceMeters: 20,
    targetHeightMeters: 1,
    shoulderOffsetMeters: 0,
    pitchRadians: 0.2,
    minimumPitchRadians: -1,
    maximumPitchRadians: 1,
    positionDampingPerSecond: 10,
    horizontalPositionDampingPerSecond: 10,
    verticalPositionDampingPerSecond: 10,
    maximumPositionLagMeters: 2,
    rotationDampingPerSecond: 10,
    yawDampingPerSecond: 10,
    pitchDampingPerSecond: 10,
    collisionRadiusMeters: 0.2,
    collisionRetractionMetersPerSecond: 20,
    collisionRecoveryMetersPerSecond: 5,
    baseFovDegrees: 60,
    speedFovDegreesPerMeterPerSecond: 0,
    maximumSpeedFovDegrees: 0,
    lookAheadSeconds: 0,
    accelerationLookAheadSecondsSquared: 0,
    transitionSeconds: 0.3,
    minimumHeadingSpeedMetersPerSecond: 0,
    velocityHeadingDampingPerSecond: 10,
    fovDampingPerSecond: 10,
    horizontalDeadZoneRatio: 0,
    verticalDeadZoneRatio: 0,
    recenterDelaySeconds: 0,
    recenterDurationSeconds: 0,
    recenterMinimumSpeedMetersPerSecond: 0,
    teleportSnapDistanceMeters: 10,
    lookSensitivityXRatio: 1,
    lookSensitivityYRatio: 1,
  };
}

function modifier(cameraModifierProfileRef: string): CameraModifierProfileV1 {
  return { cameraModifierProfileRef, parameterOverrides: {} };
}

function profile(
  rules: readonly CameraContextRuleV2[],
  options: { firstPerson?: boolean } = { firstPerson: true },
): CameraContextProfileV1 {
  return {
    cameraContextProfileRef:
      "worldkit://camera-context/capability-driven.default@1",
    defaultCameraRigProfileRef: DEFAULT_RIG_REF,
    ...(options.firstPerson === false
      ? {}
      : { firstPersonCameraRigProfileRef: FIRST_PERSON_RIG_REF }),
    rules,
    cameraRigProfiles: [
      rig(DEFAULT_RIG_REF),
      rig(FIRST_PERSON_RIG_REF, "first-person"),
      rig(FLIGHT_RIG_REF, "flight-horizon"),
    ],
    cameraModifierProfiles: [
      modifier("worldkit://camera-modifier/aim@1"),
      modifier("worldkit://camera-modifier/mounted@1"),
      modifier("worldkit://camera-modifier/shared@1"),
    ],
  };
}

function sample(
  overrides: Partial<CameraContextSampleV1> = {},
): CameraContextSampleV1 {
  return {
    simulationTick: 42,
    controlledEntityId: "rider",
    targetEntityId: "flying-sword",
    movementMedium: "air",
    activeMotionProfileRef: "worldkit://motion/flight@1",
    activeMotionKernelRef: "worldkit://motion-kernel/flight@1",
    motionTags: ["cruise"],
    activeActionRefs: ["worldkit://action/ride@1"],
    relationshipContexts: [
      {
        id: "mount-rider-sword",
        type: "mountedOn",
        riderEntityId: "rider",
        mountEntityId: "flying-sword",
        mountSlotId: "stand-slot",
      },
    ],
    velocityMetersPerSecondXYZ: [6, 0, 8],
    socketPositionsMetersXYZById: {
      "camera.flight": [0, 2, -1],
    },
    cameraContextTags: ["aim"],
    ...overrides,
  };
}

const FLIGHT_RULE: CameraContextRuleV2 = {
  id: "flight",
  priority: 100,
  when: {
    allRelationshipConditions: [{ type: "mountedOn", entityRole: "mount" }],
    motionProfileRefs: ["worldkit://motion/flight@1"],
    motionKernelRefs: ["worldkit://motion-kernel/flight@1"],
    movementMediums: ["air"],
    requiredActiveActionRefs: ["worldkit://action/ride@1"],
    minimumSpeedMetersPerSecond: 9,
    maximumSpeedMetersPerSecond: 11,
    requiredSocketIds: ["camera.flight"],
  },
  cameraRigProfileRef: FLIGHT_RIG_REF,
  cameraModifierRefs: [
    "worldkit://camera-modifier/mounted@1",
    "worldkit://camera-modifier/shared@1",
  ],
};

const AIM_RULE: CameraContextRuleV2 = {
  id: "aim",
  priority: 80,
  when: { requiredCameraContextTags: ["aim"] },
  cameraModifierRefs: [
    "worldkit://camera-modifier/aim@1",
    "worldkit://camera-modifier/shared@1",
  ],
};

describe("Camera Context admission", () => {
  it("rejects duplicate Profile refs and incomplete, unknown, or non-finite parameter bags", () => {
    const base = profile([FLIGHT_RULE]);
    const { distanceMeters: _removed, ...missingDistance } = parameters();
    const invalid: CameraContextProfileV1 = {
      ...base,
      cameraRigProfiles: [
        ...base.cameraRigProfiles,
        {
          ...rig(DEFAULT_RIG_REF),
          parameters: missingDistance as unknown as CameraRigParametersV1,
        },
        {
          ...rig("worldkit://camera-profile/non-finite@1"),
          parameters: { ...parameters(), distanceMeters: Number.NaN },
        },
      ],
      cameraModifierProfiles: [
        ...base.cameraModifierProfiles,
        modifier("worldkit://camera-modifier/aim@1"),
        {
          cameraModifierProfileRef: "worldkit://camera-modifier/invalid@1",
          parameterOverrides: {
            unknownDistance: 4,
          } as unknown as CameraModifierProfileV1["parameterOverrides"],
        },
      ],
    };

    const result = admitCameraContextProfileV1(invalid);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.filter(
      (entry) => entry.code === "CAMERA_PROFILE_INVALID",
    )).toHaveLength(5);
  });

  it("rejects ambiguous priorities, empty conditions, empty outputs, and unresolved resources", () => {
    const baseInvalid = profile([
      FLIGHT_RULE,
      { ...AIM_RULE, priority: FLIGHT_RULE.priority },
      {
        id: "empty-condition",
        priority: 60,
        when: { movementMediums: [] },
        cameraRigProfileRef: "worldkit://camera-profile/missing@1",
      },
      { id: "no-output", priority: 40, when: {} },
    ]);
    const invalid: CameraContextProfileV1 = {
      ...baseInvalid,
      cameraRigProfiles: baseInvalid.cameraRigProfiles.filter(
        (candidate) => candidate.cameraRigProfileRef !== DEFAULT_RIG_REF,
      ),
    };

    const result = admitCameraContextProfileV1(invalid);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "CAMERA_RESOURCE_NOT_LOCKED",
      "CAMERA_CONTEXT_RULE_AMBIGUOUS",
      "CAMERA_RESOURCE_NOT_LOCKED",
      "CAMERA_CONTEXT_RULE_INVALID",
      "CAMERA_CONTEXT_RULE_INVALID",
    ]);
  });

  it("rejects conflicting Modifiers in the same Rule", () => {
    const baseContext = profile([{
      id: "conflicting-modifiers",
      priority: 100,
      when: {},
      cameraModifierRefs: [
        "worldkit://camera-modifier/aim@1",
        "worldkit://camera-modifier/mounted@1",
      ],
    }]);
    const context: CameraContextProfileV1 = {
      ...baseContext,
      cameraModifierProfiles: [
        {
          cameraModifierProfileRef: "worldkit://camera-modifier/aim@1",
          parameterOverrides: { baseFovDegrees: 55 },
        },
        {
          cameraModifierProfileRef: "worldkit://camera-modifier/mounted@1",
          parameterOverrides: { baseFovDegrees: 70 },
        },
        modifier("worldkit://camera-modifier/shared@1"),
      ],
    };

    const result = admitCameraContextProfileV1(context);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "CAMERA_CONTEXT_RULE_AMBIGUOUS",
        cameraContextRuleId: "conflicting-modifiers",
      }],
    });
  });

  it("rejects conflicting non-numeric Modifier policy overrides", () => {
    const baseContext = profile([{
      id: "conflicting-policies",
      priority: 100,
      when: {},
      cameraModifierRefs: [
        "worldkit://camera-modifier/aim@1",
        "worldkit://camera-modifier/mounted@1",
      ],
    }]);
    const context: CameraContextProfileV1 = {
      ...baseContext,
      cameraModifierProfiles: [
        {
          cameraModifierProfileRef: "worldkit://camera-modifier/aim@1",
          parameterOverrides: {},
          headingSourceOverride: "view",
        },
        {
          cameraModifierProfileRef: "worldkit://camera-modifier/mounted@1",
          parameterOverrides: {},
          headingSourceOverride: "target-forward",
        },
        modifier("worldkit://camera-modifier/shared@1"),
      ],
    };

    const result = admitCameraContextProfileV1(context);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "CAMERA_CONTEXT_RULE_AMBIGUOUS",
        cameraContextRuleId: "conflicting-policies",
      }],
    });
  });
});

describe("Camera View Preference admission", () => {
  it("rejects unavailable command-time preferences without silently changing mode", () => {
    const context = profile([FLIGHT_RULE], { firstPerson: false });

    const firstPerson = admitCameraViewPreferenceV1(context, {
      mode: "first-person",
    });
    const explicit = admitCameraViewPreferenceV1(context, {
      mode: "camera-rig-profile",
      cameraRigProfileRef: "worldkit://camera-profile/not-allowed@1",
    });

    expect(firstPerson).toMatchObject({
      ok: false,
      diagnostics: [{ code: "CAMERA_FIRST_PERSON_UNAVAILABLE" }],
    });
    expect(explicit).toMatchObject({
      ok: false,
      diagnostics: [{ code: "CAMERA_PREFERENCE_NOT_ALLOWED" }],
    });
  });

  it("refuses preference commands when the Camera Context itself is not admitted", () => {
    const baseContext = profile([FLIGHT_RULE]);
    const context: CameraContextProfileV1 = {
      ...baseContext,
      cameraRigProfiles: baseContext.cameraRigProfiles.filter(
        (candidate) => candidate.cameraRigProfileRef !== DEFAULT_RIG_REF,
      ),
    };

    const result = admitCameraViewPreferenceV1(context, { mode: "auto" });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "CAMERA_RESOURCE_NOT_LOCKED" }],
    });
  });
});

describe("deterministic Camera selection", () => {
  it("selects the highest-priority Rig and applies unique Modifiers low-to-high", () => {
    const result = selectCameraViewV1({
      cameraContextProfile: profile([AIM_RULE, FLIGHT_RULE]),
      cameraContextSample: sample(),
      cameraViewPreference: { mode: "auto" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toMatchObject({
      simulationTick: 42,
      targetEntityId: "flying-sword",
      activeCameraRigProfileRef: FLIGHT_RIG_REF,
      matchedCameraContextRuleIds: ["flight", "aim"],
      activeCameraModifierRefs: [
        "worldkit://camera-modifier/aim@1",
        "worldkit://camera-modifier/mounted@1",
        "worldkit://camera-modifier/shared@1",
      ],
      fallbackActive: false,
      diagnostics: [],
    });
  });

  it("is independent of Rule insertion order", () => {
    const input = {
      cameraContextSample: sample(),
      cameraViewPreference: { mode: "auto" } as const,
    };

    const left = selectCameraViewV1({
      ...input,
      cameraContextProfile: profile([FLIGHT_RULE, AIM_RULE]),
    });
    const right = selectCameraViewV1({
      ...input,
      cameraContextProfile: profile([AIM_RULE, FLIGHT_RULE]),
    });

    expect(left).toEqual(right);
  });

  it("preserves an incompatible explicit preference while entering the safe View", () => {
    const result = selectCameraViewV1({
      cameraContextProfile: profile([AIM_RULE]),
      cameraContextSample: sample({ movementMedium: "ground" }),
      cameraViewPreference: {
        mode: "camera-rig-profile",
        cameraRigProfileRef: FLIGHT_RIG_REF,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toMatchObject({
      activeCameraRigProfileRef: DEFAULT_RIG_REF,
      cameraViewPreference: {
        mode: "camera-rig-profile",
        cameraRigProfileRef: FLIGHT_RIG_REF,
      },
      fallbackActive: true,
      diagnostics: [
        { code: "CAMERA_PREFERENCE_CONTEXT_INCOMPATIBLE", severity: "warning" },
      ],
    });
  });

  it("explains every unmatched condition without reading provider state", () => {
    const result = selectCameraViewV1({
      cameraContextProfile: profile([FLIGHT_RULE]),
      cameraContextSample: sample({
        movementMedium: "ground",
        activeActionRefs: [],
        relationshipContexts: [],
        velocityMetersPerSecondXYZ: [0, 0, 0],
        socketPositionsMetersXYZById: {},
      }),
      cameraViewPreference: { mode: "auto" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.explain.cameraContextRules).toEqual([
      {
        cameraContextRuleId: "flight",
        priority: 100,
        matched: false,
        unmatchedReasons: [
          "relationship-condition-not-met",
          "movement-medium-not-matched",
          "required-action-not-active",
          "minimum-speed-not-met",
          "required-socket-unavailable",
        ],
      },
    ]);
  });
});
