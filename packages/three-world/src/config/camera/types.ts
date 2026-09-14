/** Persisted camera data is independent of scene, physics and controller state. */
export type CameraVector3 = readonly [number, number, number];
export type CameraKind = "third-person" | "first-person" | "shoulder";
export type CameraAnchor =
  | { readonly kind: "origin" | "eye" | "seat" }
  | { readonly kind: "body"; readonly heightRatio: number }
  | {
      readonly kind: "subject-local";
      readonly positionMetersXYZ: CameraVector3;
    };
export type CameraAngleLimits =
  | { readonly kind: "unbounded" }
  | {
      readonly kind: "bounded";
      readonly minimumRadians: number;
      readonly maximumRadians: number;
    };
export type CameraDistanceRange =
  | { readonly kind: "unbounded" }
  | {
      readonly kind: "bounded";
      readonly minimumDistanceMeters: number;
      readonly maximumDistanceMeters: number;
    };
export type CameraSpeedLimit =
  | { readonly kind: "unlimited" }
  | { readonly kind: "limited"; readonly maximumSpeedMetersPerSecond: number };
export interface CameraLens {
  readonly verticalFovDegrees: number;
  readonly nearMeters: number;
  readonly farMeters: number;
}
export interface CameraPosition {
  readonly anchor: CameraAnchor;
  readonly anchorOffset: {
    readonly space: "world" | "heading" | "subject";
    readonly offsetMetersXYZ: CameraVector3;
  };
  readonly subjectTranslationHalfLifeSeconds: number;
  readonly anchorHalfLifeSeconds: number;
  readonly armHalfLifeSeconds: number;
}
export interface CameraOrientation {
  readonly initialPitchRadians: number;
  readonly pitchLimitsRadians: CameraAngleLimits;
  readonly yawLimitsRadians: CameraAngleLimits;
  readonly referenceFrame: "world-up" | "subject-up";
  readonly recenter: {
    readonly enabled: boolean;
    readonly delaySeconds: number;
    readonly minimumSpeedMetersPerSecond: number;
    readonly yawHalfLifeSeconds: number;
    readonly pitch?: {
      readonly targetRadians: number;
      readonly halfLifeSeconds: number;
    };
  };
}
export interface CameraConstraints {
  readonly collision: {
    readonly enabled: boolean;
    readonly radiusMeters: number;
    readonly armClearanceMeters: number;
    readonly pivotClearanceMeters: number;
  };
  readonly retraction: {
    readonly halfLifeSeconds: number;
    readonly speedLimit: CameraSpeedLimit;
  };
  readonly recovery: {
    readonly halfLifeSeconds: number;
    readonly speedLimit: CameraSpeedLimit;
    readonly clearHoldSeconds: number;
    readonly releaseDeadbandMeters: number;
  };
}
export interface CameraSpeedFov {
  readonly enabled: boolean;
  readonly fullEffectSpeedMetersPerSecond: number;
  readonly maximumOffsetDegrees: number;
  readonly halfLifeSeconds: number;
}
export interface CameraSpeedDistance {
  readonly enabled: boolean;
  readonly fullEffectSpeedMetersPerSecond: number;
  readonly maximumOffsetMeters: number;
  readonly extendHalfLifeSeconds: number;
  readonly retractHalfLifeSeconds: number;
}
interface CameraCommonValues {
  readonly lens: CameraLens;
  readonly position: CameraPosition;
  readonly orientation: CameraOrientation;
  readonly constraints: CameraConstraints;
}
export interface CameraThirdPersonValues extends CameraCommonValues {
  readonly framing: { readonly kind: "look-at" | "preserve-opening" };
  readonly subjectFade: {
    readonly enabled: boolean;
    readonly startDistanceMeters: number;
    readonly endDistanceMeters: number;
  };
  readonly position: CameraPosition & { readonly distanceMeters: number };
  readonly zoom: {
    readonly range: CameraDistanceRange;
    readonly halfLifeSeconds: number;
  };
  readonly constraints: CameraConstraints & {
    readonly visibility: "preserve-framing" | "require-line-of-sight";
  };
  readonly effects: {
    readonly speedDistance: CameraSpeedDistance;
    readonly speedFov: CameraSpeedFov;
  };
}
export interface CameraShoulderValues
  extends Omit<CameraThirdPersonValues, "framing"> {}
export interface CameraFirstPersonValues extends CameraCommonValues {
  readonly orientation: CameraOrientation & {
    readonly rollInheritanceRatio: number;
  };
  readonly effects: { readonly speedFov: CameraSpeedFov };
}
/** Arrays replace atomically; discriminated branch changes also replace atomically. */
export type CameraOverrides<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { readonly [K in keyof T]?: CameraOverrides<T[K]> }
    : T;
export interface CameraOpeningConfiguration {
  readonly positionWorldMetersXYZ: CameraVector3;
  readonly lookAtWorldMetersXYZ: CameraVector3;
  readonly upWorldXYZ?: CameraVector3;
  readonly fovDegrees: number;
}
export type CameraViewConfiguration =
  | {
      readonly kind: "third-person";
      readonly presetId?: string;
      readonly overrides?: CameraOverrides<CameraThirdPersonValues>;
      readonly opening?: CameraOpeningConfiguration;
    }
  | {
      readonly kind: "first-person";
      readonly presetId?: string;
      readonly overrides?: CameraOverrides<CameraFirstPersonValues>;
    }
  | {
      readonly kind: "shoulder";
      readonly presetId?: string;
      readonly overrides?: CameraOverrides<CameraShoulderValues>;
    };
export interface CameraSourceIdentity {
  readonly id: string;
  readonly version: string;
}
export type CameraPreset =
  | {
      readonly kind: "third-person";
      readonly values: CameraOverrides<CameraThirdPersonValues>;
      readonly sourceIdentity?: CameraSourceIdentity;
    }
  | {
      readonly kind: "first-person";
      readonly values: CameraOverrides<CameraFirstPersonValues>;
      readonly sourceIdentity?: CameraSourceIdentity;
    }
  | {
      readonly kind: "shoulder";
      readonly values: CameraOverrides<CameraShoulderValues>;
      readonly sourceIdentity?: CameraSourceIdentity;
    };
export interface CameraSubjectViewOverride {
  readonly presetId?: string;
  readonly overrides?: CameraOverrides<
    CameraThirdPersonValues | CameraFirstPersonValues | CameraShoulderValues
  >;
}
export interface CameraDocument {
  readonly kind: "world-camera";
  readonly schemaVersion: 1;
  readonly defaultViewId: string;
  readonly views: Readonly<Record<string, CameraViewConfiguration>>;
  readonly binding: {
    readonly targetEntityId: string;
    readonly mountTarget?: "actor" | "vehicle";
    readonly subjectOverrides?: Readonly<
      Record<
        string,
        { readonly views: Readonly<Record<string, CameraSubjectViewOverride>> }
      >
    >;
  };
  readonly presets?: Readonly<Record<string, CameraPreset>>;
  readonly activation?: "on-input" | "immediate";
  readonly input?: {
    readonly orbitRateRadiansPerSecond?: number;
    readonly cycleViewIds?: readonly string[];
  };
  readonly transition?: { readonly durationSeconds?: number };
}
export interface CameraSubjectContext {
  readonly viewId?: string;
  readonly subjectId: string;
  readonly subjectGeneration: number;
  readonly subjectKind: string;
  readonly availableAnchors: readonly ("eye" | "seat")[];
  readonly body?: {
    readonly minimumHeightMeters: number;
    readonly maximumHeightMeters: number;
  };
  readonly headingAvailable: boolean;
  /** Geometry fact computed by the binding adapter, never tuning. */
  readonly openingDistanceMeters?: number;
}
export type CameraFieldSource =
  | "sdk-default"
  | "view-preset"
  | "subject-preset"
  | "project-view"
  | "project-subject"
  | "opening";
export type CameraJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CameraJsonValue[]
  | { readonly [key: string]: CameraJsonValue };
export interface CameraFieldProvenance {
  readonly source: CameraFieldSource;
  readonly configured: CameraJsonValue;
  readonly effective?: CameraJsonValue;
  readonly inactiveReason?: "preserve-opening" | "heading-unavailable";
}
interface CameraResolvedCommon {
  readonly viewId: string;
  readonly subjectId: string;
  readonly subjectGeneration: number;
  readonly subjectKind: string;
  readonly activation: "on-input" | "immediate";
  readonly mountTarget: "actor" | "vehicle";
  readonly input: {
    readonly orbitRateRadiansPerSecond: number;
    readonly cycleViewIds: readonly string[];
  };
  readonly transition: { readonly durationSeconds: number };
  readonly fields: Readonly<Record<string, CameraFieldProvenance>>;
}
export type ResolvedCameraConfiguration = CameraResolvedCommon &
  (
    | {
        readonly kind: "third-person";
        readonly values: CameraThirdPersonValues;
        readonly opening?: CameraOpeningConfiguration;
      }
    | {
        readonly kind: "first-person";
        readonly values: CameraFirstPersonValues;
      }
    | { readonly kind: "shoulder"; readonly values: CameraShoulderValues }
  );
