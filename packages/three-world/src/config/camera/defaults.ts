import type {
  CameraFirstPersonValues,
  CameraThirdPersonValues,
  CameraShoulderValues,
} from "./types";
const common = {
  lens: { verticalFovDegrees: 58, nearMeters: 0.1, farMeters: 2000 },
  position: {
    anchor: { kind: "body", heightRatio: 0.7 },
    anchorOffset: { space: "heading", offsetMetersXYZ: [0, 0, 0] },
    subjectTranslationHalfLifeSeconds: 0.08,
    anchorHalfLifeSeconds: 0.1,
    armHalfLifeSeconds: 0.1,
  },
  orientation: {
    initialPitchRadians: 0.2,
    pitchLimitsRadians: {
      kind: "bounded",
      minimumRadians: -1.4,
      maximumRadians: 1.4,
    },
    yawLimitsRadians: { kind: "unbounded" },
    referenceFrame: "world-up",
    recenter: {
      enabled: true,
      delaySeconds: 1.5,
      minimumSpeedMetersPerSecond: 0.8,
      yawHalfLifeSeconds: Math.LN2 / 1.9,
    },
  },
  constraints: {
    collision: {
      enabled: true,
      radiusMeters: 0.2,
      armClearanceMeters: 0.05,
      pivotClearanceMeters: 0.05,
    },
    retraction: {
      halfLifeSeconds: 0.08,
      speedLimit: {kind: "limited", maximumSpeedMetersPerSecond: 12},
    },
    recovery: {
      halfLifeSeconds: 0.24,
      speedLimit: { kind: "limited", maximumSpeedMetersPerSecond: 8 },
      clearHoldSeconds: 0,
      releaseDeadbandMeters: 0,
    },
  },
  effects: {
    speedFov: {
      enabled: false,
      fullEffectSpeedMetersPerSecond: 30,
      maximumOffsetDegrees: 12,
      halfLifeSeconds: 0.18,
    },
  },
} as const;
export const CAMERA_THIRD_PERSON_DEFAULTS: CameraThirdPersonValues = {
  ...common,
  framing: { kind: "look-at" },
  subjectFade: {enabled: true, startDistanceMeters: 1, endDistanceMeters: 0.45},
  position: { ...common.position, distanceMeters: 8.8 },
  zoom: {
    range: {
      kind: "bounded",
      minimumDistanceMeters: 0,
      maximumDistanceMeters: 12,
    },
    halfLifeSeconds: 0.18,
  },
  constraints: { ...common.constraints, visibility: "preserve-framing" },
  effects: {
    ...common.effects,
    speedDistance: {
      enabled: false,
      fullEffectSpeedMetersPerSecond: 30,
      maximumOffsetMeters: 4,
      extendHalfLifeSeconds: 0.18,
      retractHalfLifeSeconds: 0.18,
    },
  },
};
export const CAMERA_FIRST_PERSON_DEFAULTS: CameraFirstPersonValues = {
  ...common,
  constraints: {...common.constraints, retraction: {halfLifeSeconds: 0, speedLimit: {kind: "unlimited"}}, recovery: {...common.constraints.recovery, speedLimit: {kind: "unlimited"}}},
  position: { ...common.position, anchor: { kind: "eye" } },
  orientation: {
    ...common.orientation,
    initialPitchRadians: 0,
    rollInheritanceRatio: 1,
  },
};
const { framing: _, ...following } = CAMERA_THIRD_PERSON_DEFAULTS;
export const CAMERA_SHOULDER_DEFAULTS: CameraShoulderValues = {
  ...following,
  position: {
    ...common.position,
    anchor: { kind: "eye" },
    anchorOffset: { space: "heading", offsetMetersXYZ: [0.4, 0, 0] },
    distanceMeters: 2,
  },
  zoom: {
    range: {
      kind: "bounded",
      minimumDistanceMeters: 1.3,
      maximumDistanceMeters: 3.2,
    },
    halfLifeSeconds: 0.18,
  },
};
export const CAMERA_DOCUMENT_DEFAULTS = {
  activation: "on-input",
  mountTarget: "vehicle",
  input: { orbitRateRadiansPerSecond: 2, cycleViewIds: [] },
  transition: { durationSeconds: 0.25 },
} as const;
export const CAMERA_STRATEGY_DEFAULTS = {
  "third-person": CAMERA_THIRD_PERSON_DEFAULTS,
  "first-person": CAMERA_FIRST_PERSON_DEFAULTS,
  shoulder: CAMERA_SHOULDER_DEFAULTS,
} as const;

// Published defaults are immutable even for JavaScript consumers.
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
freeze(CAMERA_STRATEGY_DEFAULTS);
freeze(CAMERA_DOCUMENT_DEFAULTS);
