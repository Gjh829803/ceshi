export type CameraViewPreferenceV1 =
  | { readonly mode: "auto" }
  | { readonly mode: "first-person" }
  | {
      readonly mode: "camera-rig-profile";
      readonly cameraRigProfileRef: string;
    };

export type CameraRelationshipRoleV1 =
  | "none"
  | "rider"
  | "driver"
  | "passenger"
  | "tethered";

export type CameraRelationshipContextV1 =
  | {
      readonly id: string;
      readonly type: "possessedBy";
      readonly controlledEntityId: string;
      readonly controllerEntityId: string;
    }
  | {
      readonly id: string;
      readonly type: "mountedOn";
      readonly riderEntityId: string;
      readonly mountEntityId: string;
      readonly mountSlotId: string;
    }
  | {
      readonly id: string;
      readonly type: "equippedAt";
      readonly itemEntityId: string;
      readonly wearerEntityId: string;
      readonly equipmentSlotId: string;
    };

export interface CameraContextSampleV1 {
  readonly simulationTick: number;
  readonly controlledEntityId: string;
  readonly targetEntityId: string;
  readonly movementMedium: "ground" | "air";
  readonly activeMotionProfileRef: string;
  readonly activeMotionKernelRef: string;
  readonly motionTags: readonly string[];
  readonly activeActionRefs: readonly string[];
  readonly relationshipContexts: readonly CameraRelationshipContextV1[];
  readonly relationshipRole: CameraRelationshipRoleV1;
  readonly velocityMetersPerSecondXYZ: readonly [number, number, number];
  readonly socketPositionsMetersXYZById: Readonly<
    Record<string, readonly [number, number, number]>
  >;
  readonly cameraContextTags: readonly string[];
}

export type CameraRelationshipConditionV1 =
  | { type: "possessedBy"; entityRole: "controlled" | "controller" }
  | { type: "mountedOn"; entityRole: "rider" | "mount" }
  | { type: "equippedAt"; entityRole: "item" | "wearer" };

export const CAMERA_RIG_PARAMETER_NAMES_V1 = [
  "distanceMeters",
  "minimumDistanceMeters",
  "maximumDistanceMeters",
  "targetHeightMeters",
  "shoulderOffsetMeters",
  "pitchRadians",
  "minimumPitchRadians",
  "maximumPitchRadians",
  "positionDampingPerSecond",
  "horizontalPositionDampingPerSecond",
  "verticalPositionDampingPerSecond",
  "maximumPositionLagMeters",
  "rotationDampingPerSecond",
  "yawDampingPerSecond",
  "pitchDampingPerSecond",
  "collisionRadiusMeters",
  "collisionRetractionMetersPerSecond",
  "collisionRecoveryMetersPerSecond",
  "baseFovDegrees",
  "speedFovDegreesPerMeterPerSecond",
  "maximumSpeedFovDegrees",
  "lookAheadSeconds",
  "accelerationLookAheadSecondsSquared",
  "transitionSeconds",
  "minimumHeadingSpeedMetersPerSecond",
  "velocityHeadingDampingPerSecond",
  "fovDampingPerSecond",
  "horizontalDeadZoneRatio",
  "verticalDeadZoneRatio",
  "recenterDelaySeconds",
  "recenterDurationSeconds",
  "recenterMinimumSpeedMetersPerSecond",
  "teleportSnapDistanceMeters",
  "lookSensitivityXRatio",
  "lookSensitivityYRatio",
] as const;

export type CameraRigParameterNameV1 =
  typeof CAMERA_RIG_PARAMETER_NAMES_V1[number];
export type CameraRigParametersV1 = Record<CameraRigParameterNameV1, number>;

export function cameraRigParametersViolateInvariantsV1(
  parameters: Readonly<Partial<CameraRigParametersV1>>,
): boolean {
  const negativeAllowed = new Set<keyof CameraRigParametersV1>([
    "shoulderOffsetMeters",
    "pitchRadians",
    "minimumPitchRadians",
    "maximumPitchRadians",
  ]);
  return Object.entries(parameters).some(([name, value]) =>
    !Number.isFinite(value) ||
    (!negativeAllowed.has(name as keyof CameraRigParametersV1) && value < 0)
  ) ||
    (parameters.minimumDistanceMeters !== undefined &&
      parameters.maximumDistanceMeters !== undefined &&
      parameters.minimumDistanceMeters > parameters.maximumDistanceMeters) ||
    (parameters.distanceMeters !== undefined &&
      parameters.minimumDistanceMeters !== undefined &&
      parameters.distanceMeters < parameters.minimumDistanceMeters) ||
    (parameters.distanceMeters !== undefined &&
      parameters.maximumDistanceMeters !== undefined &&
      parameters.distanceMeters > parameters.maximumDistanceMeters) ||
    (parameters.minimumPitchRadians !== undefined &&
      parameters.maximumPitchRadians !== undefined &&
      parameters.minimumPitchRadians > parameters.maximumPitchRadians) ||
    (parameters.pitchRadians !== undefined &&
      parameters.minimumPitchRadians !== undefined &&
      parameters.pitchRadians < parameters.minimumPitchRadians) ||
    (parameters.pitchRadians !== undefined &&
      parameters.maximumPitchRadians !== undefined &&
      parameters.pitchRadians > parameters.maximumPitchRadians) ||
    (parameters.horizontalDeadZoneRatio !== undefined &&
      parameters.horizontalDeadZoneRatio > 1) ||
    (parameters.verticalDeadZoneRatio !== undefined &&
      parameters.verticalDeadZoneRatio > 1) ||
    (parameters.baseFovDegrees !== undefined && parameters.baseFovDegrees <= 0) ||
    (parameters.baseFovDegrees !== undefined &&
      parameters.maximumSpeedFovDegrees !== undefined &&
      parameters.baseFovDegrees + parameters.maximumSpeedFovDegrees >= 180) ||
    (parameters.lookSensitivityXRatio !== undefined &&
      parameters.lookSensitivityXRatio <= 0) ||
    (parameters.lookSensitivityYRatio !== undefined &&
      parameters.lookSensitivityYRatio <= 0);
}

export interface CameraContextRuleV2 {
  readonly id: string;
  readonly priority: number;
  readonly when: {
    readonly relationshipRoles?: readonly CameraRelationshipRoleV1[];
    readonly allRelationshipConditions?: readonly CameraRelationshipConditionV1[];
    readonly motionProfileRefs?: readonly string[];
    readonly motionKernelRefs?: readonly string[];
    readonly movementMediums?: readonly ("ground" | "air")[];
    readonly requiredActiveActionRefs?: readonly string[];
    readonly minimumSpeedMetersPerSecond?: number;
    readonly maximumSpeedMetersPerSecond?: number;
    readonly requiredSocketIds?: readonly string[];
    readonly requiredCameraContextTags?: readonly string[];
  };
  readonly cameraRigProfileRef?: string;
  readonly cameraModifierRefs?: readonly string[];
}

export interface CameraRigProfileV1 {
  readonly cameraRigProfileRef: string;
  readonly algorithmRef: string;
  readonly baseMode:
    | "first-person"
    | "free-orbit"
    | "stable-follow"
    | "speed-chase"
    | "flight-horizon";
  readonly headingSource: "view" | "target-forward" | "target-velocity";
  readonly reverseHeadingPolicy: "follow-velocity" | "preserve-target-forward";
  readonly recenterMode: "off" | "forward-motion" | "always";
  readonly preferredSocketIds: readonly string[];
  readonly parameters: CameraRigParametersV1;
}

export interface CameraModifierProfileV1 {
  readonly cameraModifierProfileRef: string;
  readonly parameterOverrides: Readonly<Partial<CameraRigParametersV1>>;
  readonly headingSourceOverride?: CameraRigProfileV1["headingSource"];
  readonly reverseHeadingPolicyOverride?: CameraRigProfileV1["reverseHeadingPolicy"];
  readonly recenterModeOverride?: CameraRigProfileV1["recenterMode"];
}

export interface CameraContextProfileV1 {
  readonly cameraContextProfileRef: string;
  readonly defaultCameraRigProfileRef: string;
  readonly firstPersonCameraRigProfileRef?: string;
  readonly rules: readonly CameraContextRuleV2[];
  readonly cameraRigProfiles: readonly CameraRigProfileV1[];
  readonly cameraModifierProfiles: readonly CameraModifierProfileV1[];
}

export type CameraDiagnosticCodeV1 =
  | "CAMERA_RESOURCE_NOT_LOCKED"
  | "CAMERA_PROFILE_INVALID"
  | "CAMERA_CONTEXT_RULE_AMBIGUOUS"
  | "CAMERA_CONTEXT_RULE_INVALID"
  | "CAMERA_PREFERENCE_NOT_ALLOWED"
  | "CAMERA_FIRST_PERSON_UNAVAILABLE"
  | "CAMERA_REQUIRED_SOCKET_MISSING"
  | "CAMERA_PREFERENCE_CONTEXT_INCOMPATIBLE";

export interface CameraDiagnosticV1 {
  readonly severity: "error" | "warning";
  readonly code: CameraDiagnosticCodeV1;
  readonly message: string;
  readonly cameraContextProfileRef: string;
  readonly cameraContextRuleId?: string;
  readonly resourceRef?: string;
}

export interface CameraContextRuleExplainV1 {
  readonly cameraContextRuleId: string;
  readonly priority: number;
  readonly matched: boolean;
  readonly unmatchedReasons: readonly string[];
}

export interface CameraSelectionExplainV1 {
  readonly cameraViewPreference: CameraViewPreferenceV1;
  readonly cameraContextRules: readonly CameraContextRuleExplainV1[];
  readonly selectedCameraRigProfileRef: string;
  readonly appliedCameraModifierRefs: readonly string[];
  readonly fallbackActive: boolean;
}

export interface CameraSelectionDecisionV1 {
  readonly schemaVersion: 1;
  readonly simulationTick: number;
  readonly targetEntityId: string;
  readonly activeCameraRigProfileRef: string;
  readonly activeCameraModifierRefs: readonly string[];
  readonly matchedCameraContextRuleIds: readonly string[];
  readonly cameraViewPreference: CameraViewPreferenceV1;
  readonly fallbackActive: boolean;
  readonly diagnostics: readonly CameraDiagnosticV1[];
  readonly explain: CameraSelectionExplainV1;
}

export type CameraAdmissionResultV1 =
  | { ok: true }
  | { ok: false; diagnostics: readonly CameraDiagnosticV1[] };

export type CameraViewPreferenceAdmissionResultV1 =
  | { ok: true; cameraViewPreference: CameraViewPreferenceV1 }
  | { ok: false; diagnostics: readonly CameraDiagnosticV1[] };

export type CameraSelectionResultV1 =
  | { ok: true; decision: CameraSelectionDecisionV1 }
  | { ok: false; diagnostics: readonly CameraDiagnosticV1[] };

export interface CameraSelectionInputV1 {
  readonly cameraContextProfile: CameraContextProfileV1;
  readonly cameraContextSample: CameraContextSampleV1;
  readonly cameraViewPreference: CameraViewPreferenceV1;
}
