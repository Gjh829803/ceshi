import type {
  CameraKind,
  CameraLens,
  CameraVector3,
  ResolvedCameraConfiguration,
} from "../../config/camera/index";
import type { CameraQuaternion, CameraSubjectFacts } from "../subject";

export interface CameraProposal {
  readonly positionWorldMetersXYZ: CameraVector3;
  readonly quaternionWorldXYZW: CameraQuaternion;
  readonly lookAtWorldMetersXYZ: CameraVector3;
  readonly upWorldXYZ: CameraVector3;
  readonly pivotWorldMetersXYZ: CameraVector3;
  /** Internal composition intent, independent of collision-constrained eye position. */
  readonly composition?: {
    readonly nominalAimQuaternionWorldXYZW: CameraQuaternion;
    readonly relativeAimQuaternionXYZW: CameraQuaternion;
    readonly referenceQuaternionWorldXYZW: CameraQuaternion;
  };
  readonly lens: CameraLens;
  readonly visibility:
    | "safety-only"
    | "preserve-framing"
    | "require-line-of-sight";
  readonly visibilityTargetWorldMetersXYZ?: CameraVector3;
  readonly nominalDistanceMeters: number;
}
export interface CameraIntent {
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly distanceMeters: number;
  readonly secondsSinceOrbit: number;
}
export interface CameraStrategyHistory<K extends CameraKind = CameraKind> {
  readonly kind: K;
  readonly subjectId: string;
  readonly subjectGeneration: number;
  readonly viewId: string;
  readonly translationWorldMetersXYZ: CameraVector3;
  readonly anchorRelativeMetersXYZ: CameraVector3;
  /** Unwrapped angles and radius in the declared reference frame. */
  readonly orbitYawRadians: number;
  readonly orbitPitchRadians: number;
  readonly orbitRadiusMeters: number;
  readonly zoomDistanceMeters: number;
  readonly speedDistanceMeters: number;
  readonly speedFovDegrees: number;
  readonly headingRadians: number;
  readonly horizonQuaternionWorldXYZW: CameraQuaternion;
}
export interface CameraOpeningReference {
  readonly viewId: string;
  readonly distanceMeters: number;
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly framingQuaternionXYZW: CameraQuaternion;
}
export interface CameraStrategyInput<K extends CameraKind> {
  readonly subject: CameraSubjectFacts;
  readonly configuration: Extract<ResolvedCameraConfiguration, { kind: K }>;
  readonly intent: CameraIntent;
  readonly history?: CameraStrategyHistory<K> | undefined;
  readonly opening?: CameraOpeningReference | undefined;
  readonly deltaSeconds: number;
}
export interface CameraStrategyResult<K extends CameraKind> {
  readonly proposal: CameraProposal;
  readonly history: CameraStrategyHistory<K>;
  readonly intent: CameraIntent;
}
