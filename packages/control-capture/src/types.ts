import type { SemanticInputActionV1 } from "@whitebox-world/runtime-contracts";

export type Sha256HashV1 = `sha256:${string}`;

export interface SimulationTickRateV1 {
  readonly numeratorTicks: number;
  readonly denominatorSeconds: number;
}

export interface CaptureFrameRateV1 {
  readonly numeratorFrames: number;
  readonly denominatorSeconds: number;
}

export interface ScriptedControllerV1 {
  readonly id: string;
  readonly kind: "scripted";
  readonly controlledEntityId: string;
  readonly controlProfileRef: string;
  readonly initialSequence: number;
}

export interface ControlIntentKeyframeV1 {
  readonly tick: number;
  readonly moveAxesXZ: readonly [number, number];
  readonly runEnabled: boolean;
  readonly jumpPressed: boolean;
}

export interface ControlIntentTrackV1 {
  readonly id: string;
  readonly kind: "control-intent";
  readonly controllerId: string;
  readonly interpolation: "step";
  readonly keyframes: readonly ControlIntentKeyframeV1[];
}

export interface CameraRigKeyframeV1 {
  readonly tick: number;
  readonly viewYawOffsetRadians: number;
  readonly viewPitchOffsetRadians: number;
  readonly viewDistanceOffsetMeters: number;
}

export interface CameraRigTrackV1 {
  readonly id: string;
  readonly kind: "camera-rig";
  readonly cameraEntityId: string;
  readonly cameraRigRef: string;
  readonly interpolation: "step";
  readonly keyframes: readonly CameraRigKeyframeV1[];
}

export type SimulationTakeTrackV1 = ControlIntentTrackV1 | CameraRigTrackV1;

export interface ConstantFrameRateCaptureScheduleV1 {
  readonly kind: "constant-frame-rate";
  readonly captureFrameRate: CaptureFrameRateV1;
  readonly firstCaptureTick: number;
  readonly lastCaptureTickInclusive: number;
  readonly renderInterpolation: { readonly kind: "none" };
}

export interface ExplicitTicksCaptureScheduleV1 {
  readonly kind: "explicit-ticks";
  readonly captureTicks: readonly number[];
  readonly renderInterpolation: { readonly kind: "none" };
}

export type CaptureScheduleV1 =
  | ConstantFrameRateCaptureScheduleV1
  | ExplicitTicksCaptureScheduleV1;

export interface SimulationTakeV1 {
  readonly kind: "worldkit-simulation-take";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly seed: number;
  readonly simulationTickRate: SimulationTickRateV1;
  readonly startTick: number;
  readonly endTickExclusive: number;
  readonly controllers: readonly ScriptedControllerV1[];
  readonly tracks: readonly SimulationTakeTrackV1[];
  readonly captureSchedule: CaptureScheduleV1;
  readonly captureProfileRef: "worldkit://capture/profile/control-video@1";
  readonly captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1";
}

export interface CaptureScheduleEntryV1 {
  readonly captureFrameIndex: number;
  readonly simulationTick: number;
}

export interface CaptureSchedulePlanV1 {
  readonly kind: "worldkit-capture-schedule-plan";
  readonly schemaVersion: 1;
  readonly entries: readonly CaptureScheduleEntryV1[];
}

export interface CompiledSimulationTakeV1 {
  readonly kind: "worldkit-compiled-simulation-take";
  readonly schemaVersion: 1;
  readonly take: SimulationTakeV1;
  readonly takeHash: Sha256HashV1;
  readonly captureSchedulePlan: CaptureSchedulePlanV1;
}

export type SimulationTakeDiagnosticCodeV1 =
  | "TAKE_ARRAY_INVALID"
  | "TAKE_BOOLEAN_INVALID"
  | "TAKE_CAPTURE_PROFILE_UNSUPPORTED"
  | "TAKE_CAPTURE_TICKS_NOT_STRICTLY_INCREASING"
  | "TAKE_FIELD_UNKNOWN"
  | "TAKE_HASH_INVALID"
  | "TAKE_ID_DUPLICATE"
  | "TAKE_INTEGER_INVALID"
  | "TAKE_KEYFRAME_TICK_OUT_OF_RANGE"
  | "TAKE_KEYFRAMES_NOT_STRICTLY_INCREASING"
  | "TAKE_KIND_INVALID"
  | "TAKE_MOVE_AXES_INVALID"
  | "TAKE_NUMBER_INVALID"
  | "TAKE_OBJECT_INVALID"
  | "TAKE_STRING_INVALID"
  | "TAKE_TICK_RANGE_INVALID"
  | "TAKE_TICK_RATE_UNSUPPORTED"
  | "TAKE_TRACK_CHANNEL_CONFLICT";

export interface SimulationTakeDiagnosticV1 {
  readonly code: SimulationTakeDiagnosticCodeV1;
  readonly path: string;
  readonly message: string;
}

export type SimulationTakeValidationResultV1 =
  | {
      readonly ok: true;
      readonly value: SimulationTakeV1;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly SimulationTakeDiagnosticV1[];
    };

export interface TickInputStateV1 {
  readonly actions: readonly SemanticInputActionV1[];
}
