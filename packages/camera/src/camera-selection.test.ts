import { describe, expect, it } from "vitest";
import {
  admitCameraContextProfileV1,
  admitCameraViewPreferenceV1,
  selectCameraViewV2,
  type CameraContextProfileV1,
  type CameraContextRuleV2,
  type CameraContextSampleV2,
  type CameraModifierProfileV1,
  type CameraRigParametersV1,
  type CameraRigProfileV1,
  type CameraViewPreferenceV1,
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

interface CameraSampleOverridesV2 {
  readonly committedTick?: number;
  readonly relationshipRole?: CameraContextSampleV2["environment"]["relationshipRole"];
  readonly relationshipContexts?: CameraContextSampleV2["environment"]["relationshipContexts"];
  readonly movementMedium?: "ground" | "air";
  readonly mobilityMode?: "grounded" | "airborne";
  readonly gait?: "none" | "idle" | "walk" | "run";
  readonly verticalPhase?: "none" | "takeoff" | "rising" | "apex" | "falling" | "landing";
  readonly activeActionRefs?: readonly string[];
  readonly isInterruptible?: boolean;
  readonly socketPositionsMetersXYZById?: Readonly<Record<string, readonly [number, number, number]>>;
  readonly cameraContextTags?: readonly string[];
}

function sample(overrides: CameraSampleOverridesV2 = {}): CameraContextSampleV2 {
  const committedTick = overrides.committedTick ?? 42;
  const movementMedium = overrides.movementMedium ?? "air";
  const mobilityMode = overrides.mobilityMode ?? (
    movementMedium === "air" ? "airborne" : "grounded"
  );
  const gait = overrides.gait ?? (mobilityMode === "airborne" ? "none" : "idle");
  const verticalPhase = overrides.verticalPhase ?? (
    mobilityMode === "airborne" ? "falling" : "none"
  );
  return {
    schemaVersion: 2,
    semanticAuthorityStatus: "available",
    committedTick,
    controlledEntityId: "rider",
    targetEntityId: "flying-sword",
    subjectPose: {
      positionMetersXYZ: [0, 1, 0],
      facingYawRadians: 0.25,
    },
    locomotion: {
      schemaVersion: 2,
      status: "active",
      mobilityMode,
      gait,
      verticalPhase,
      supportMode: mobilityMode === "airborne" ? "unsupported" : "supported",
      movementMedium,
      facingYawRadians: 0.25,
      linearVelocity: mobilityMode === "airborne"
        ? { x: 600, y: -1, z: 800 }
        : { x: 0, y: 0, z: 0 },
      horizontalSpeedMetersPerSecond: mobilityMode === "airborne" ? 1000 : 0,
      committedTick,
      phaseEnteredTick: committedTick,
      transitionSequence: 3,
    },
    actionSummary: {
      status: "available",
      activeActionRefs: overrides.activeActionRefs ?? ["worldkit://semantic-action/ride@1"],
      isInterruptible: overrides.isInterruptible ?? false,
    },
    environment: {
      relationshipContexts: overrides.relationshipContexts ?? [
        {
          id: "mount-rider-sword",
          type: "mountedOn",
          riderEntityId: "rider",
          mountEntityId: "flying-sword",
          mountSlotId: "stand-slot",
        },
      ],
      relationshipRole: overrides.relationshipRole ?? "rider",
      socketPositionsMetersXYZById: overrides.socketPositionsMetersXYZById ?? {
        "camera.flight": [0, 2, -1],
      },
      cameraContextTags: overrides.cameraContextTags ?? ["aim"],
    },
  };
}

const FLIGHT_RULE: CameraContextRuleV2 = {
  id: "flight",
  priority: 100,
  when: {
    allRelationshipConditions: [{ type: "mountedOn", entityRole: "mount" }],
    mobilityModes: ["airborne"],
    verticalPhases: ["falling"],
    movementMediums: ["air"],
    requiredActiveActionRefs: ["worldkit://semantic-action/ride@1"],
    actionInterruptibility: "non-interruptible",
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
  it.each([
    ["legacy Motion Kernel condition", { motionKernelRefs: ["worldkit://motion-kernel/legacy@1"] }],
    ["unknown gait", { gaits: ["teleport"] }],
    ["duplicate phase", { verticalPhases: ["falling", "falling"] }],
    ["ill-formed Action ref", { requiredActiveActionRefs: ["bad\ud800ref"] }],
    ["non-canonical Action ref", { requiredActiveActionRefs: ["action.ride"] }],
    ["non-NFC Socket id", { requiredSocketIds: ["cafe\u0301"] }],
    ["whitespace Socket id", { requiredSocketIds: ["camera target"] }],
    ["duplicate Context tag", { requiredCameraContextTags: ["aim", "aim"] }],
    ["non-canonical Context tag", { requiredCameraContextTags: ["Aim Mode"] }],
    ["duplicate Action ref", {
      requiredActiveActionRefs: [
        "worldkit://semantic-action/ride@1",
        "worldkit://semantic-action/ride@1",
      ],
    }],
    ["oversized Action condition", {
      requiredActiveActionRefs: Array.from(
        { length: 65 },
        (_, index) => `worldkit://semantic-action/hostile-${index}@1`,
      ),
    }],
    ["non-finite minimum speed", { minimumSpeedMetersPerSecond: Number.NaN }],
    ["negative maximum speed", { maximumSpeedMetersPerSecond: -1 }],
    ["incoherent speed bounds", { minimumSpeedMetersPerSecond: 4, maximumSpeedMetersPerSecond: 3 }],
    ["malformed relationship", { allRelationshipConditions: [{ type: "mountedOn", entityRole: "driver" }] }],
  ])("rejects a strict closed V2 Rule with %s", (_label, when) => {
    const invalid = profile([{
      id: "hostile",
      priority: 999,
      when,
      cameraRigProfileRef: FLIGHT_RIG_REF,
    } as unknown as CameraContextRuleV2]);

    expect(admitCameraContextProfileV1(invalid)).toMatchObject({
      ok: false,
      diagnostics: [{ code: "CAMERA_PROFILE_INVALID" }],
    });
    expect(selectCameraViewV2({
      cameraContextProfile: invalid,
      cameraContextSample: sample(),
      cameraViewPreference: { mode: "auto" },
    })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "CAMERA_PROFILE_INVALID" }],
    });
  });

  it("rejects unknown keys at every V2 Profile resource layer", () => {
    const valid = profile([FLIGHT_RULE]);
    const firstRule = valid.rules[0];
    const firstRig = valid.cameraRigProfiles[0];
    const firstModifier = valid.cameraModifierProfiles[0];
    if (firstRule === undefined || firstRig === undefined || firstModifier === undefined) {
      throw new Error("Camera Profile fixture is incomplete.");
    }
    const hostiles = [
      { ...valid, legacyProfileRef: "worldkit://camera-context/legacy@1" },
      {
        ...valid,
        rules: [{ ...firstRule, legacyRule: true }, ...valid.rules.slice(1)],
      },
      {
        ...valid,
        cameraRigProfiles: [{ ...firstRig, legacyMode: "spring-arm" }, ...valid.cameraRigProfiles.slice(1)],
      },
      {
        ...valid,
        cameraModifierProfiles: [{ ...firstModifier, legacyWeight: 1 }, ...valid.cameraModifierProfiles.slice(1)],
      },
    ] as unknown as CameraContextProfileV1[];

    for (const hostile of hostiles) {
      expect(admitCameraContextProfileV1(hostile)).toMatchObject({
        ok: false,
        diagnostics: [{ code: "CAMERA_PROFILE_INVALID" }],
      });
    }
  });

  it("rejects non-canonical versioned Camera resource refs", () => {
    const valid = profile([FLIGHT_RULE]);
    const hostile = {
      ...valid,
      defaultCameraRigProfileRef: "follow.medium",
    } as CameraContextProfileV1;

    expect(admitCameraContextProfileV1(hostile)).toMatchObject({
      ok: false,
      diagnostics: [{ code: "CAMERA_PROFILE_INVALID" }],
    });
  });

  it("snapshots a hostile Proxy once and never rereads caller-owned Profile bytes", () => {
    const target = profile([FLIGHT_RULE]) as unknown as Record<string, unknown>;
    const reads: string[] = [];
    const proxied = new Proxy(target, {
      get: (_object, key) => {
        reads.push(String(key));
        throw new Error("TOCTOU_DIRECT_READ");
      },
    }) as unknown as CameraContextProfileV1;

    const result = selectCameraViewV2({
      cameraContextProfile: proxied,
      cameraContextSample: sample(),
      cameraViewPreference: { mode: "auto" },
    });

    expect(reads).toEqual([]);
    expect(result).toMatchObject({
      ok: true,
      decision: { activeCameraRigProfileRef: FLIGHT_RIG_REF },
    });
  });

  it("rejects a finite Camera parameter bag whose bounds contradict its selected values", () => {
    // This catches admission that validates only field names and finiteness but
    // allows a Rig that no runtime algorithm can resolve consistently.
    const base = profile([FLIGHT_RULE]);
    const invalid: CameraContextProfileV1 = {
      ...base,
      cameraRigProfiles: base.cameraRigProfiles.map((candidate) =>
        candidate.cameraRigProfileRef === DEFAULT_RIG_REF
          ? {
              ...candidate,
              parameters: {
                ...candidate.parameters,
                distanceMeters: 6,
                minimumDistanceMeters: 8,
                maximumDistanceMeters: 4,
              },
            }
          : candidate
      ),
    };

    const result = admitCameraContextProfileV1(invalid);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "CAMERA_PROFILE_INVALID",
      resourceRef: DEFAULT_RIG_REF,
    }));
  });

  it("rejects a finite Camera Modifier override that violates parameter invariants", () => {
    // This catches a finite Modifier that passes vocabulary checks but is
    // already invalid before any selected-Rig combination is resolved.
    const base = profile([AIM_RULE]);
    const invalid: CameraContextProfileV1 = {
      ...base,
      cameraModifierProfiles: base.cameraModifierProfiles.map((candidate) =>
        candidate.cameraModifierProfileRef === "worldkit://camera-modifier/aim@1"
          ? {
              ...candidate,
              parameterOverrides: { distanceMeters: -1 },
            }
          : candidate
      ),
    };

    const result = admitCameraContextProfileV1(invalid);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "CAMERA_PROFILE_INVALID",
      resourceRef: "worldkit://camera-modifier/aim@1",
    }));
  });

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
    )).toHaveLength(1);
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
  it.each([
    ["legacy key", { mode: "auto", motionKernelRef: "worldkit://motion-kernel/x@1" }],
    ["invalid mode", { mode: "bogus" }],
    ["missing explicit ref", { mode: "camera-rig-profile" }],
    ["extraneous auto ref", {
      mode: "auto",
      cameraRigProfileRef: DEFAULT_RIG_REF,
    }],
    ["non-canonical explicit ref", {
      mode: "camera-rig-profile",
      cameraRigProfileRef: "follow.medium",
    }],
  ])("rejects a malformed Preference with %s in both public paths", (_label, preference) => {
    const context = profile([FLIGHT_RULE]);
    expect(admitCameraViewPreferenceV1(
      context,
      preference as unknown as CameraViewPreferenceV1,
    )).toMatchObject({
      ok: false,
      diagnostics: [{ code: "CAMERA_PREFERENCE_INVALID" }],
    });
    expect(selectCameraViewV2({
      cameraContextProfile: context,
      cameraContextSample: sample(),
      cameraViewPreference: preference as unknown as CameraViewPreferenceV1,
    })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "CAMERA_PREFERENCE_INVALID" }],
    });
  });

  it("snapshots one hostile Preference descriptor and never reads it again", () => {
    let descriptorReads = 0;
    const target = { mode: "auto" };
    const preference = new Proxy(target, {
      get: () => { throw new Error("PREFERENCE_DIRECT_READ"); },
      getOwnPropertyDescriptor: (object, key) => {
        if (key === "mode") {
          descriptorReads += 1;
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: descriptorReads === 1 ? "auto" : "bogus",
          };
        }
        return Reflect.getOwnPropertyDescriptor(object, key);
      },
    }) as unknown as CameraViewPreferenceV1;

    const result = selectCameraViewV2({
      cameraContextProfile: profile([FLIGHT_RULE]),
      cameraContextSample: sample(),
      cameraViewPreference: preference,
    });

    expect(descriptorReads).toBe(1);
    expect(result).toMatchObject({
      ok: true,
      decision: {
        activeCameraRigProfileRef: FLIGHT_RIG_REF,
        cameraViewPreference: { mode: "auto" },
      },
    });
  });

  it.each([
    ["accessor", Object.defineProperty({ mode: "auto" }, "legacy", {
      enumerable: true,
      get: () => { throw new Error("PREFERENCE_ACCESSOR_READ"); },
    })],
    ["throwing Proxy", new Proxy({ mode: "auto" }, {
      ownKeys: () => { throw new Error("PREFERENCE_PROXY_REFLECTION"); },
    })],
  ])("fails %s Preference reflection closed in admission and selection", (_label, preference) => {
    const context = profile([FLIGHT_RULE]);
    for (const result of [
      admitCameraViewPreferenceV1(
        context,
        preference as unknown as CameraViewPreferenceV1,
      ),
      selectCameraViewV2({
        cameraContextProfile: context,
        cameraContextSample: sample(),
        cameraViewPreference: preference as unknown as CameraViewPreferenceV1,
      }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        diagnostics: [{ code: "CAMERA_PREFERENCE_INVALID" }],
      });
    }
  });

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
  it("evaluates relationship, tag, and active-only dimensions independently while suspended", () => {
    const active = sample();
    const suspended: CameraContextSampleV2 = {
      ...active,
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId: "3c-task6-authority-unavailable",
        committedTick: active.committedTick,
        transitionSequence: 3,
      },
      actionSummary: { status: "unavailable" },
    };
    const result = selectCameraViewV2({
      cameraContextProfile: profile([FLIGHT_RULE, AIM_RULE]),
      cameraContextSample: suspended,
      cameraViewPreference: { mode: "auto" },
    });

    expect(result).toMatchObject({
      ok: true,
      decision: {
        activeCameraRigProfileRef: DEFAULT_RIG_REF,
        activeCameraModifierRefs: [
          "worldkit://camera-modifier/aim@1",
          "worldkit://camera-modifier/shared@1",
        ],
        matchedCameraContextRuleIds: ["aim"],
        fallbackActive: false,
        explain: {
          cameraContextRules: [
            { matched: false },
            { matched: true, unmatchedReasons: [] },
          ],
        },
      },
    });
  });

  it("selects a relationship-owned mounted Rig for legitimate suspended locomotion", () => {
    const mountedRule: CameraContextRuleV2 = {
      id: "mounted-suspended",
      priority: 200,
      when: {
        relationshipRoles: ["rider"],
        allRelationshipConditions: [{ type: "mountedOn", entityRole: "rider" }],
        locomotionStatuses: ["suspended"],
      },
      cameraRigProfileRef: FLIGHT_RIG_REF,
    };
    const active = sample();
    const suspended: CameraContextSampleV2 = {
      ...active,
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId: "mount-rider-sword",
        committedTick: active.committedTick,
        transitionSequence: 4,
      },
    };

    expect(selectCameraViewV2({
      cameraContextProfile: profile([mountedRule]),
      cameraContextSample: suspended,
      cameraViewPreference: { mode: "auto" },
    })).toMatchObject({
      ok: true,
      decision: {
        activeCameraRigProfileRef: FLIGHT_RIG_REF,
        matchedCameraContextRuleIds: ["mounted-suspended"],
      },
    });
  });

  it("bypasses every auto Rule while transitional semantic authority is unavailable", () => {
    const rules: readonly CameraContextRuleV2[] = [
      {
        id: "tag-only",
        priority: 130,
        when: { requiredCameraContextTags: ["sprint"] },
        cameraRigProfileRef: FLIGHT_RIG_REF,
      },
      {
        id: "role-only",
        priority: 120,
        when: { relationshipRoles: ["rider"] },
        cameraRigProfileRef: FLIGHT_RIG_REF,
      },
      {
        id: "suspended-only",
        priority: 110,
        when: { locomotionStatuses: ["suspended"] },
        cameraRigProfileRef: FLIGHT_RIG_REF,
      },
    ];
    const active = sample();
    const seam: CameraContextSampleV2 = {
      ...active,
      semanticAuthorityStatus: "unavailable",
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId: "3c-task6-authority-unavailable",
        committedTick: active.committedTick,
        transitionSequence: 0,
      },
      actionSummary: { status: "unavailable" },
      environment: {
        relationshipRole: "none",
        relationshipContexts: [],
        socketPositionsMetersXYZById: {},
        cameraContextTags: [],
      },
    };
    const result = selectCameraViewV2({
      cameraContextProfile: profile(rules),
      cameraContextSample: seam,
      cameraViewPreference: { mode: "auto" },
    });

    expect(result).toMatchObject({
      ok: true,
      decision: {
        activeCameraRigProfileRef: DEFAULT_RIG_REF,
        activeCameraModifierRefs: [],
        matchedCameraContextRuleIds: [],
        fallbackActive: true,
        diagnostics: [{ code: "CAMERA_SEMANTIC_AUTHORITY_UNAVAILABLE" }],
        explain: {
          cameraContextRules: [
            { cameraContextRuleId: "tag-only", unmatchedReasons: ["semantic-authority-unavailable"] },
            { cameraContextRuleId: "role-only", unmatchedReasons: ["semantic-authority-unavailable"] },
            { cameraContextRuleId: "suspended-only", unmatchedReasons: ["semantic-authority-unavailable"] },
          ],
        },
      },
    });
  });

  it("honors an explicitly admitted locked Rig while unavailable auto semantics stay bypassed", () => {
    const active = sample();
    const seam: CameraContextSampleV2 = {
      ...active,
      semanticAuthorityStatus: "unavailable",
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId: "3c-task6-authority-unavailable",
        committedTick: active.committedTick,
        transitionSequence: 0,
      },
      actionSummary: { status: "unavailable" },
      environment: {
        relationshipRole: "none",
        relationshipContexts: [],
        socketPositionsMetersXYZById: {},
        cameraContextTags: [],
      },
    };

    expect(selectCameraViewV2({
      cameraContextProfile: profile([{
        id: "suspended-only",
        priority: 100,
        when: { locomotionStatuses: ["suspended"] },
        cameraRigProfileRef: FLIGHT_RIG_REF,
      }]),
      cameraContextSample: seam,
      cameraViewPreference: {
        mode: "camera-rig-profile",
        cameraRigProfileRef: FLIGHT_RIG_REF,
      },
    })).toMatchObject({
      ok: true,
      decision: {
        activeCameraRigProfileRef: FLIGHT_RIG_REF,
        matchedCameraContextRuleIds: [],
        diagnostics: [{ code: "CAMERA_SEMANTIC_AUTHORITY_UNAVAILABLE" }],
      },
    });
  });

  it("returns one recursively cloned and frozen V2 authority result", () => {
    const input = profile([FLIGHT_RULE, AIM_RULE]);
    const result = selectCameraViewV2({
      cameraContextProfile: input,
      cameraContextSample: sample(),
      cameraViewPreference: { mode: "auto" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.decision)).toBe(true);
    expect(Object.isFrozen(result.decision.matchedCameraContextRuleIds)).toBe(true);
    expect(Object.isFrozen(result.decision.diagnostics)).toBe(true);
    expect(Object.isFrozen(result.decision.explain)).toBe(true);
    expect(Object.isFrozen(result.decision.explain.cameraContextRules)).toBe(true);
    expect(Object.isFrozen(result.decision.explain.cameraContextRules[0]?.unmatchedReasons)).toBe(true);
    expect(() => {
      (result.decision as { activeCameraRigProfileRef: string }).activeCameraRigProfileRef = "hostile";
    }).toThrow();
    expect(result.decision.activeCameraRigProfileRef).toBe(FLIGHT_RIG_REF);
  });

  it("matches relationship roles only for the matching Camera Context sample", () => {
    const mountedRule: CameraContextRuleV2 = {
      id: "mounted-framing",
      priority: 100,
      when: { relationshipRoles: ["rider"] },
      cameraModifierRefs: ["worldkit://camera-modifier/mounted@1"],
    };
    const noRelationshipMatch = selectCameraViewV2({
      cameraContextProfile: profile([mountedRule]),
      cameraContextSample: sample({ relationshipRole: "none" }),
      cameraViewPreference: { mode: "camera-rig-profile", cameraRigProfileRef: DEFAULT_RIG_REF },
    });
    const riderMatch = selectCameraViewV2({
      cameraContextProfile: profile([mountedRule]),
      cameraContextSample: sample({ relationshipRole: "rider" }),
      cameraViewPreference: { mode: "camera-rig-profile", cameraRigProfileRef: DEFAULT_RIG_REF },
    });

    expect(noRelationshipMatch).toMatchObject({
      ok: true,
      decision: {
        activeCameraRigProfileRef: DEFAULT_RIG_REF,
        activeCameraModifierRefs: [],
      },
    });
    expect(riderMatch).toMatchObject({
      ok: true,
      decision: {
        // An explicit base Profile remains the selection authority; matching
        // relationship rules only contribute their declared Modifiers.
        activeCameraRigProfileRef: DEFAULT_RIG_REF,
        activeCameraModifierRefs: ["worldkit://camera-modifier/mounted@1"],
      },
    });
  });

  it("selects the highest-priority Rig and applies unique Modifiers low-to-high", () => {
    const result = selectCameraViewV2({
      cameraContextProfile: profile([AIM_RULE, FLIGHT_RULE]),
      cameraContextSample: sample(),
      cameraViewPreference: { mode: "auto" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toMatchObject({
      committedTick: 42,
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

    const left = selectCameraViewV2({
      ...input,
      cameraContextProfile: profile([FLIGHT_RULE, AIM_RULE]),
    });
    const right = selectCameraViewV2({
      ...input,
      cameraContextProfile: profile([AIM_RULE, FLIGHT_RULE]),
    });

    expect(left).toEqual(right);
  });

  it("preserves an incompatible explicit preference while entering the safe View", () => {
    const result = selectCameraViewV2({
      cameraContextProfile: profile([AIM_RULE]),
      cameraContextSample: sample({
        movementMedium: "ground",
        mobilityMode: "grounded",
        gait: "idle",
        verticalPhase: "none",
      }),
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
    const result = selectCameraViewV2({
      cameraContextProfile: profile([FLIGHT_RULE]),
      cameraContextSample: sample({
        movementMedium: "ground",
        mobilityMode: "grounded",
        gait: "idle",
        verticalPhase: "none",
        activeActionRefs: [],
        isInterruptible: true,
        relationshipContexts: [],
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
          "mobility-mode-not-matched",
          "vertical-phase-not-matched",
          "movement-medium-not-matched",
          "required-action-not-active",
          "action-interruptibility-not-matched",
          "required-socket-unavailable",
        ],
      },
    ]);
  });

  it.each([
    ["takeoff", "worldkit://camera-modifier/takeoff@1"],
    ["rising", "worldkit://camera-modifier/rising@1"],
    ["apex", "worldkit://camera-modifier/apex@1"],
    ["falling", "worldkit://camera-modifier/falling@1"],
  ] as const)("selects the %s semantic phase without consulting contradictory velocity", (
    verticalPhase,
    modifierRef,
  ) => {
    const context = profile([{
      id: `phase-${verticalPhase}`,
      priority: 120,
      when: { verticalPhases: [verticalPhase] },
      cameraModifierRefs: [modifierRef],
    }]);
    const input: CameraContextProfileV1 = {
      ...context,
      cameraModifierProfiles: [
        ...context.cameraModifierProfiles,
        modifier(modifierRef),
      ],
    };
    const result = selectCameraViewV2({
      cameraContextProfile: input,
      cameraContextSample: sample({ verticalPhase }),
      cameraViewPreference: { mode: "auto" },
    });

    expect(result).toMatchObject({
      ok: true,
      decision: {
        activeCameraModifierRefs: [modifierRef],
        matchedCameraContextRuleIds: [`phase-${verticalPhase}`],
      },
    });
  });

  it("rejects Tick/facing mismatches before semantic rule evaluation", () => {
    const committed = sample();
    const mismatched = {
      ...committed,
      locomotion: {
        ...committed.locomotion,
        committedTick: 41,
        phaseEnteredTick: 41,
      },
    };

    expect(() => selectCameraViewV2({
      cameraContextProfile: profile([FLIGHT_RULE]),
      cameraContextSample: mismatched,
      cameraViewPreference: { mode: "auto" },
    })).toThrow("3C_CAMERA_CONTEXT_UNCOMMITTED");
  });
});
