import type { Vec3 } from "./execution-plan";

export type SemanticInputActionV1 =
  | "move-forward"
  | "move-backward"
  | "move-left"
  | "move-right"
  | "jump"
  | "run";

export interface FixedInputV1 {
  actions: readonly SemanticInputActionV1[];
  ticks: number;
}

export interface CameraViewInputV1 {
  yawDeltaRadians?: number;
  pitchDeltaRadians?: number;
  zoomDeltaMeters?: number;
}

export interface CameraTuningV1 {
  distanceMeters?: number;
  targetHeightMeters?: number;
  positionDampingPerSecond?: number;
  rotationDampingPerSecond?: number;
  lookAheadSeconds?: number;
  baseFovDegrees?: number;
  speedFovDegreesPerMeterPerSecond?: number;
  maximumSpeedFovDegrees?: number;
}

export type MotionParameterTuningV1 = Readonly<Record<string, number>>;

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

export interface WorldRuntimeSessionV3 {
  readonly runtimeBackend: "babylon-havok";
  readonly ready: Promise<void>;
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV3>;
  snapshot(): WorldRuntimeSnapshotV3;
  reset(): WorldRuntimeSnapshotV3;
  renderFrame(): void;
  dispose(): Promise<void>;
}

export interface SubjectDefinitionSummaryV1 {
  resourceRef: string;
  displayName: string;
  semanticClassId: string;
  bodyTopology: string;
  agentAccessLevel: "T0" | "T1" | "T2";
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
  agentAccessLevel: "internal" | "T0" | "T1" | "T2";
}

export interface CompatibleProfileSummaryV1 {
  resourceRef: string;
  kind: "motion-profile" | "camera-rig-profile";
  displayName: string;
  role?: "default" | "optional" | "fallback" | "camera";
  parameters?: Readonly<Record<string, number | boolean>>;
  safetyLimits?: Readonly<Record<string, { minimum: number; maximum: number }>>;
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
  captureScreenshot(): string;
  reset(): WorldRuntimeSnapshotV3;
  setPaused(paused: boolean): WorldRuntimeSnapshotV3;
  listSubjectDefinitions?(): readonly SubjectDefinitionSummaryV1[];
  listMotionKernels?(): readonly MotionKernelSummaryV1[];
  listCompatibleProfiles?(
    subjectDefinitionRef: string,
  ): readonly CompatibleProfileSummaryV1[];
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
  setMotionProfile?(
    subjectEntityId: string,
    motionProfileRef: string,
  ): Promise<WorldRuntimeSnapshotV3>;
  runHarness?(subjectEntityId: string): Promise<SubjectHarnessReportV1>;
  getSubjectSnapshot?(subjectEntityId: string): SubjectRuntimeStateV3 | undefined;
  getCameraSnapshot?(): WorldRuntimeSnapshotV3["camera"];
}
