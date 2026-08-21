import type {
  ControlCapturePassIdV1,
  Sha256HashV1,
} from "@whitebox-world/control-capture";
import type { CameraTuningV1 } from "./camera-parameter-contract";
import type { Vec3 } from "./execution-plan";
import type { NumericProfileOverrideV1 } from "./subject-preset";
import type { SubjectPresetBaselineV1 } from "./subject-preset";

export type SemanticInputActionV1 =
  | "move-forward"
  | "move-backward"
  | "move-left"
  | "move-right"
  | "jump"
  | "run"
  | "boost"
  | "brake"
  | "handbrake"
  | "primary-action"
  | "secondary-action"
  | "aim"
  | "camera-recenter"
  | "camera-look-back"
  | "camera-shoulder-swap";

/**
 * Device-neutral continuous input. Keyboard callers may omit this and keep
 * using semantic actions; gamepads and agents can provide normalized axes.
 */
export interface ControlInputAxesV2 {
  moveXRatio?: number;
  moveYRatio?: number;
  throttleRatio?: number;
  brakeRatio?: number;
}

export interface FixedInputV1 {
  actions: readonly SemanticInputActionV1[];
  axes?: Readonly<ControlInputAxesV2>;
  ticks: number;
}

export interface CameraViewInputV1 {
  yawDeltaRadians?: number;
  pitchDeltaRadians?: number;
  zoomDeltaMeters?: number;
}

export type MotionParameterTuningV1 = Readonly<Record<string, number>>;

export type ControlTuningParameterNameV1 =
  | "moveDeadzoneRatio"
  | "responseExponent";

/**
 * Session-local overrides for the two numeric input-curve values consumed by
 * ControlProfileRuntime. These values never mutate the locked Registry profile.
 */
export type ControlTuningV1 = Readonly<
  Partial<Record<ControlTuningParameterNameV1, number>>
>;

export interface ViewControlFrameV1 {
  forwardXYZ: Vec3;
  rightXYZ: Vec3;
  committedTick: number;
}

export interface ViewTargetSampleV1 {
  entityId: string;
  targetPositionMetersXYZ: Vec3;
  forwardXYZ: Vec3;
  upXYZ: Vec3;
  velocityMetersPerSecondXYZ: Vec3;
  approximateRadiusMeters: number;
  socketPositionsMetersXYZById: Readonly<Record<string, Vec3>>;
  activeMotionKernelRef: string;
  motionTags: readonly string[];
  movementMedium: "ground" | "water" | "air";
  relationshipRole: "none" | "rider" | "driver" | "passenger" | "tethered";
  cameraContextTags: readonly string[];
}

export const TRUSTED_DEFAULT_CONTROLLER_ID = "controller-primary" as const;

export interface BindControlRequestV2 {
  controllerId: string;
  controlledEntityId: string;
  expectedControlledEntityId: string;
}

export interface ControlBindingReceiptV2 {
  kind: "worldkit-control-binding-receipt";
  schemaVersion: 2;
  status: "committed" | "rejected";
  controllerId: string;
  previousControlledEntityId: string;
  controlledEntityId: string;
  diagnostic?: {
    code:
      | "CONTROL_BINDING_STALE"
      | "CONTROL_CONTROLLER_NOT_FOUND"
      | "CONTROL_TARGET_NOT_FOUND";
    message: string;
  };
}

export interface ControllerRuntimeStateV3 {
  id: string;
  controlledEntityId: string;
}

export interface SubjectRuntimeStateV3 {
  entityId: string;
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  positionMetersXYZ: Vec3;
  velocityMetersPerSecondXYZ: Vec3;
  movementMedium: "ground" | "air" | "water";
  activeActionId: string;
  forwardXYZ?: Vec3;
  speedMetersPerSecond?: number;
  activeMotionProfileRef?: string;
  activeMotionKernelRef?: string;
  motionTags?: readonly string[];
  relationshipRole?: "none" | "rider" | "driver" | "passenger" | "tethered";
  safeFallbackActive?: boolean;
  motionFailureCode?: string;
  motionParameterTuning?: MotionParameterTuningV1;
  controlParameterTuning?: ControlTuningV1;
}

export interface ApplySubjectPresetTuningRequestV1 {
  subjectEntityId: string;
  expectedSubjectDefinitionRef: string;
  expectedSubjectDefinitionContentHash: string;
  motionOverridesByProfileRef: Readonly<
    Record<string, NumericProfileOverrideV1>
  >;
  controlOverridesByProfileRef: Readonly<
    Record<string, NumericProfileOverrideV1>
  >;
  cameraOverridesByProfileRef: Readonly<
    Record<string, NumericProfileOverrideV1>
  >;
  cameraPreference: string;
}

export interface SubjectPresetTuningReceiptV1 {
  status: "committed" | "rejected";
  diagnostic?: { code: string; message: string };
  snapshot: WorldRuntimeSnapshotV3;
}

export interface WorldRuntimeSnapshotV3 {
  kind: "worldkit-runtime-snapshot";
  schemaVersion: 3;
  runtimeBackend: "babylon-havok";
  tick: number;
  ready: boolean;
  controlledEntityId: string;
  controllersById: Readonly<Record<string, ControllerRuntimeStateV3>>;
  subjectStatesByEntityId: Readonly<Record<string, SubjectRuntimeStateV3>>;
  camera: {
    entityId: string;
    targetEntityId: string;
    positionMetersXYZ: Vec3;
    activeCameraProfileRef?: string;
    activeCameraRigRef?: string;
    activeCameraModifierRefs?: readonly string[];
    preference?: string;
    safeFallbackActive?: boolean;
    viewYawOffsetRadians?: number;
    viewPitchOffsetRadians?: number;
    viewDistanceOffsetMeters?: number;
    tuning?: Readonly<CameraTuningV1>;
  };
  physics: { backend: "havok"; ready: boolean; fixedTimeStepSeconds: number };
  resources: {
    meshes: number;
    bodies: number;
    terrainSamples: number;
  };
}

export interface ControlCaptureCapabilitiesV1 {
  readonly kind: "worldkit-control-capture-capabilities";
  readonly schemaVersion: 1;
  readonly available: boolean;
  readonly captureProfileRef: "worldkit://capture/profile/control-video@1";
  readonly captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1";
  readonly requiredPassIds: readonly ControlCapturePassIdV1[];
  readonly maximumWidthPixels: number;
  readonly maximumHeightPixels: number;
  readonly diagnostics: readonly {
    readonly code: "CONTROL_CAPTURE_FLOAT_RENDER_UNAVAILABLE" | "CONTROL_CAPTURE_MRT_UNAVAILABLE";
    readonly message: string;
  }[];
}

export interface RenderReadyReceiptV1 {
  readonly kind: "worldkit-render-ready-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly simulationTick: number;
  readonly renderFrameIndex: number;
}

export interface ControlCaptureRequestV1 {
  readonly captureFrameIndex: number;
  readonly expectedSimulationTick: number;
  readonly renderReadyReceiptId: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
}

export interface ControlCapturePassPayloadV1 {
  readonly passId: ControlCapturePassIdV1;
  readonly mediaType: "image/png" | "application/octet-stream";
  readonly encoding: "png-rgba8-srgb" | "float32-le" | "uint32-le" | "float32x3-le";
  readonly byteLength: number;
  readonly contentHash: Sha256HashV1;
  readonly bytesBase64: string;
}

export interface ControlCaptureCameraV1 {
  readonly cameraEntityId: string;
  readonly cameraRigRef: string;
  readonly positionMetersXYZ: Vec3;
  readonly forwardXYZ: Vec3;
  readonly upXYZ: Vec3;
  readonly verticalFovRadians: number;
  readonly nearClipMeters: number;
  readonly farClipMeters: number;
  readonly viewMatrixColumnMajor: readonly number[];
  readonly projectionMatrixColumnMajor: readonly number[];
}

export interface ControlCaptureSemanticClassEntryV1 {
  readonly numericId: number;
  readonly semanticClassId: string;
}

export interface ControlCaptureInstanceEntryV1 {
  readonly numericId: number;
  readonly entityId: string;
  readonly semanticClassId: string;
}

export interface RuntimeControlCaptureFrameV1 {
  readonly kind: "worldkit-control-capture-frame";
  readonly schemaVersion: 1;
  readonly runtimeSessionId: string;
  readonly captureFrameIndex: number;
  readonly simulationTick: number;
  readonly renderFrameIndex: number;
  readonly renderReadyReceiptId: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly camera: ControlCaptureCameraV1;
  readonly snapshot: WorldRuntimeSnapshotV3;
  readonly semanticClasses: readonly ControlCaptureSemanticClassEntryV1[];
  readonly instances: readonly ControlCaptureInstanceEntryV1[];
  readonly passesById: Readonly<Record<ControlCapturePassIdV1, ControlCapturePassPayloadV1>>;
}

export interface WorldRuntimeSessionV3 {
  readonly runtimeBackend: "babylon-havok";
  readonly ready: Promise<void>;
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV3>;
  snapshot(): WorldRuntimeSnapshotV3;
  reset(): WorldRuntimeSnapshotV3;
  applySubjectPresetTuning?(
    request: ApplySubjectPresetTuningRequestV1,
  ): SubjectPresetTuningReceiptV1;
  getControlCaptureCapabilities(): ControlCaptureCapabilitiesV1;
  waitForRenderReady(expectedSimulationTick: number): RenderReadyReceiptV1;
  captureControlFrame(request: ControlCaptureRequestV1): Promise<RuntimeControlCaptureFrameV1>;
  renderFrame(): RenderReadyReceiptV1;
  dispose(): Promise<void>;
}

export interface SubjectDefinitionSummaryV1 {
  resourceRef: string;
  contentHash: string;
  displayName: string;
  semanticClassId: string;
  bodyTopology: string;
  authoringAvailability: "recommended" | "advanced" | "experimental";
  defaultMotionProfileRef: string;
  controlProfileRef: string;
  cameraContextProfileRef: string;
}

export interface MotionKernelSummaryV1 {
  resourceRef: string;
  displayName: string;
  implementationId: string;
  commandKind: string;
  runtimeStatus: "implemented" | "reserved";
  authoringAvailability: "internal" | "recommended" | "advanced" | "experimental";
}

export interface CapabilityDiscoveryOptionsV1 {
  includeExperimental?: boolean;
  includeInternal?: boolean;
}

export interface CompatibleProfileSummaryV1 {
  resourceRef: string;
  contentHash: string;
  kind: "motion-profile" | "control-profile" | "camera-rig-profile";
  displayName: string;
  role?: "default" | "optional" | "fallback" | "camera";
  baseMode?: "first-person" | "free-orbit" | "stable-follow" | "speed-chase" | "flight-horizon";
  headingSource?: "view" | "target-forward" | "target-velocity";
  recenterMode?: "off" | "forward-motion" | "always";
  parameters?: Readonly<Record<string, number | boolean>>;
  safetyLimits?: Readonly<Record<string, { minimum: number; maximum: number }>>;
  authoringRanges?: Readonly<
    Record<string, { minimum: number; maximum: number; step: number }>
  >;
  runtimeParameterNames?: readonly string[];
  draftOnlyParameterNames?: readonly string[];
}

export interface SubjectPackageValidationResultV1 {
  valid: boolean;
  subjectDefinitionRef: string;
  diagnostics: readonly { code: string; message: string }[];
}

export interface SubjectHarnessCheckResultV1 {
  checkId: "H01" | "H02" | "H03" | "H04" | "H05" | "H06" | "H07" | "H08" | "H09";
  status: "passed" | "failed" | "not-exercised";
  message: string;
}

export interface SubjectHarnessReportV1 {
  subjectEntityId: string;
  passed: boolean;
  checks: readonly SubjectHarnessCheckResultV1[];
  tick: number;
}

export const WORLDKIT_BROWSER_PROTOCOL_VERSION = 3 as const;

export interface WorldkitBrowserDiagnosticV1 {
  severity: "info" | "warning" | "error";
  code: string;
  instancePath: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface WorldkitBrowserApiV3 {
  version: typeof WORLDKIT_BROWSER_PROTOCOL_VERSION;
  ready(): Promise<WorldRuntimeSnapshotV3>;
  getSnapshot(): WorldRuntimeSnapshotV3;
  getDiagnostics(): readonly WorldkitBrowserDiagnosticV1[];
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV3>;
  getControlCaptureCapabilities(): ControlCaptureCapabilitiesV1;
  waitForSimulationTick(expectedSimulationTick: number): Promise<WorldRuntimeSnapshotV3>;
  waitForRenderReady(expectedSimulationTick: number): Promise<RenderReadyReceiptV1>;
  captureControlFrame(request: ControlCaptureRequestV1): Promise<RuntimeControlCaptureFrameV1>;
  captureScreenshot(): string;
  reset(): WorldRuntimeSnapshotV3;
  setPaused(paused: boolean): WorldRuntimeSnapshotV3;
  listSubjectDefinitions?(
    options?: CapabilityDiscoveryOptionsV1,
  ): readonly SubjectDefinitionSummaryV1[];
  listMotionKernels?(
    options?: CapabilityDiscoveryOptionsV1,
  ): readonly MotionKernelSummaryV1[];
  listCompatibleProfiles?(
    subjectDefinitionRef: string,
  ): readonly CompatibleProfileSummaryV1[];
  getSubjectPresetBaseline?(
    subjectDefinitionRef: string,
  ): SubjectPresetBaselineV1;
  validateSubjectPackage?(
    subjectDefinitionRef: string,
  ): SubjectPackageValidationResultV1;
  setIntent?(input: FixedInputV1): Promise<WorldRuntimeSnapshotV3>;
  setCameraPreference?(preference: string): WorldRuntimeSnapshotV3;
  adjustCameraView?(input: CameraViewInputV1): WorldRuntimeSnapshotV3;
  resetCameraView?(): WorldRuntimeSnapshotV3;
  setCameraTuning?(tuning: CameraTuningV1): WorldRuntimeSnapshotV3;
  setMotionTuning?(
    subjectEntityId: string,
    tuning: MotionParameterTuningV1,
  ): WorldRuntimeSnapshotV3;
  setControlTuning?(
    subjectEntityId: string,
    tuning: ControlTuningV1,
  ): WorldRuntimeSnapshotV3;
  getControlTuning?(subjectEntityId: string): ControlTuningV1;
  applySubjectPresetTuning?(
    request: ApplySubjectPresetTuningRequestV1,
  ): SubjectPresetTuningReceiptV1;
  setMotionProfile?(
    subjectEntityId: string,
    motionProfileRef: string,
  ): Promise<WorldRuntimeSnapshotV3>;
  runHarness?(subjectEntityId: string): Promise<SubjectHarnessReportV1>;
  getSubjectSnapshot?(subjectEntityId: string): SubjectRuntimeStateV3 | undefined;
  getCameraSnapshot?(): WorldRuntimeSnapshotV3["camera"];
}
