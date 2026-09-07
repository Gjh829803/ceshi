import type { Sha256HashV1 } from "@whitebox-world/protocol";

import type {
  ControlCapturePassIdV1,
} from "@whitebox-world/control-capture";
import type {
  GameplayCommandReceiptV1,
  GameplayCommandV1,
  GameplayCapabilityStateV1,
  GameplayDiagnosticV1,
  GameplayEventV1,
  GameplayInspectionSnapshotV1,
  SpatialEntityStateV1,
  WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import type { SubjectPresetBaselineV1 } from "@whitebox-world/subject-contracts";
import type {
  CameraRelationshipContextV1,
  CameraRigParametersV1,
  CameraSelectionDecisionV2,
  CameraViewPreferenceV1,
} from "@whitebox-world/camera";
export type { CameraViewPreferenceV1 } from "@whitebox-world/camera";
import { isNil } from "lodash-es";
import type {
  RouteEvidenceSelectorV1,
  RouteOverlayQueryResultV2,
  RoutePathReceiptQueryResultV2,
  RouteRuntimeProbeReceiptQueryResultV2,
  RouteSummaryQueryResultV1,
} from "./browser-route-evidence";
import type { CameraTuningV1 } from "./camera-parameter-contract";
import type {
  CameraViewCommandReceiptV1,
  CameraViewCommandV1,
  CameraViewEventV1,
} from "./camera-view-contract";
import type { RuntimeVec3V1 } from "./world-runtime-bootstrap";

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

const MAXIMUM_FIXED_INPUT_TICK_COUNT_V1 = 36_000;
const SEMANTIC_INPUT_ACTIONS_V1 = new Set<SemanticInputActionV1>([
  "move-forward",
  "move-backward",
  "move-left",
  "move-right",
  "jump",
  "run",
  "boost",
  "brake",
  "handbrake",
  "primary-action",
  "secondary-action",
  "aim",
  "camera-recenter",
  "camera-look-back",
  "camera-shoulder-swap",
]);

function invalidRuntimeContract(schemaName: string): never {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}

function snapshotRuntimeContractRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || isNil(value)) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (!isNil(prototype) && prototype !== Object.prototype) return undefined;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function snapshotRuntimeContractArray(
  value: unknown,
): readonly unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  try {
    if (Reflect.getPrototypeOf(value) !== Array.prototype) return undefined;
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
      return undefined;
    }
    if (Object.getOwnPropertyNames(value).length !== value.length + 1) {
      return undefined;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function hasExactRuntimeContractKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Reflect.ownKeys(record);
  return actual.length === keys.length && actual.every(
    (key) => typeof key === "string" && keys.includes(key),
  );
}

function isSafeRuntimeContractTick(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0) &&
    value <= MAXIMUM_FIXED_INPUT_TICK_COUNT_V1;
}

function isRuntimeContractAxis(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    !Object.is(value, -0) &&
    value >= minimum &&
    value <= maximum;
}

export function parseFixedInputV1(value: unknown): FixedInputV1 {
  const schemaName = "FixedInputV1";
  const record = snapshotRuntimeContractRecord(value) ??
    invalidRuntimeContract(schemaName);
  const hasAxes = hasExactRuntimeContractKeys(record, [
    "actions",
    "axes",
    "ticks",
  ]);
  if (
    (!hasExactRuntimeContractKeys(record, ["actions", "ticks"]) && !hasAxes) ||
    !isSafeRuntimeContractTick(record.ticks)
  ) return invalidRuntimeContract(schemaName);
  const actions = snapshotRuntimeContractArray(record.actions);
  if (
    isNil(actions) ||
    actions.some((action) =>
      typeof action !== "string" ||
      !SEMANTIC_INPUT_ACTIONS_V1.has(action as SemanticInputActionV1)
    )
  ) return invalidRuntimeContract(schemaName);
  let axes: Readonly<ControlInputAxesV2> | undefined;
  if (hasAxes) {
    const axesRecord = snapshotRuntimeContractRecord(record.axes) ??
      invalidRuntimeContract(schemaName);
    const axisKeys = [
      "moveXRatio",
      "moveYRatio",
      "throttleRatio",
      "brakeRatio",
    ] as const;
    if (
      Reflect.ownKeys(axesRecord).some((key) =>
        typeof key !== "string" ||
        !axisKeys.includes(key as typeof axisKeys[number])
      ) ||
      ["moveXRatio", "moveYRatio"].some((key) =>
        Object.hasOwn(axesRecord, key) &&
        !isRuntimeContractAxis(axesRecord[key], -1, 1)
      ) ||
      ["throttleRatio", "brakeRatio"].some((key) =>
        Object.hasOwn(axesRecord, key) &&
        !isRuntimeContractAxis(axesRecord[key], 0, 1)
      )
    ) return invalidRuntimeContract(schemaName);
    axes = Object.freeze({ ...axesRecord }) as Readonly<ControlInputAxesV2>;
  }
  return Object.freeze({
    actions: Object.freeze([...actions] as SemanticInputActionV1[]),
    ...(!isNil(axes) ? { axes } : {}),
    ticks: record.ticks,
  });
}

export interface CameraViewInputV1 {
  yawDeltaRadians?: number;
  pitchDeltaRadians?: number;
  zoomDeltaMeters?: number;
}

export type PublishedMovementMediumV1 = "ground" | "air";
export type LocomotionModeV1 = "idle" | "walk" | "run" | "airborne";

export interface ViewControlFrameV1 {
  forwardXYZ: RuntimeVec3V1;
  rightXYZ: RuntimeVec3V1;
  committedTick: number;
}

export interface ViewTargetSampleV1 {
  controlledEntityId: string;
  entityId: string;
  targetPositionMetersXYZ: RuntimeVec3V1;
  forwardXYZ: RuntimeVec3V1;
  upXYZ: RuntimeVec3V1;
  velocityMetersPerSecondXYZ: RuntimeVec3V1;
  approximateRadiusMeters: number;
  socketPositionsMetersXYZById: Readonly<Record<string, RuntimeVec3V1>>;
  movementMedium: PublishedMovementMediumV1;
  relationshipContexts: readonly CameraRelationshipContextV1[];
  cameraContextTags: readonly string[];
}

export interface ApplySubjectPresetTuningRequestV1 {
  subjectEntityId: string;
  expectedSubjectDefinitionRef: string;
  expectedSubjectDefinitionContentHash: string;
  selectedMotionProfileRef: string;
  selectedControlFeelProfileRef: string;
  selectedControlProfileRef: string;
}

export interface SubjectPresetTuningReceiptV1 {
  status: "committed" | "rejected";
  diagnostic?: { code: string; message: string };
  snapshot: WorldRuntimeSnapshotV4;
}

export interface CameraSubjectOcclusionInstanceStateV1 {
  readonly batchId: string;
  readonly instanceIndex: number;
  readonly opacityRatio: number;
  readonly targetOpacityRatio: number;
}

/** Camera-owned presentation state; never Character collision or support truth. */
export interface CameraSubjectOcclusionStateV1 {
  readonly isEnabled: boolean;
  readonly isSelectionInitialized: boolean;
  readonly selectionElapsedSeconds: number;
  readonly selectedInstanceCount: number;
  readonly fadedInstanceCount: number;
  readonly instances: readonly CameraSubjectOcclusionInstanceStateV1[];
}

export type WorldRuntimeCameraStateV4 =
  | Readonly<{
      mode: "unbound";
    }>
  | Readonly<{
      mode: "tracking";
      id: string;
      targetEntityId: string;
      positionMetersXYZ: RuntimeVec3V1;
      activeCameraProfileRef: string;
      authoredOpeningProfileRef?: string;
      subjectOcclusion?: CameraSubjectOcclusionStateV1;
      activeCameraRigRef: string;
      activeCameraModifierRefs: readonly string[];
      safeFallbackActive: boolean;
      viewYawOffsetRadians: number;
      viewPitchOffsetRadians: number;
      viewDistanceOffsetMeters: number;
      selectionDecision?: CameraSelectionDecisionV2;
      selectedTargetSocketId?: string;
      targetSocketPositionMetersXYZ?: RuntimeVec3V1;
      isTargetSocketFallback?: boolean;
      desiredTargetPositionMetersXYZ?: RuntimeVec3V1;
      desiredPositionMetersXYZ?: RuntimeVec3V1;
      actualPositionMetersXYZ?: RuntimeVec3V1;
      finalFovDegrees?: number;
      requestedArmLengthMeters?: number;
      safeArmLengthMeters?: number;
      effectiveArmLengthMeters?: number;
      isCollisionRetracted?: boolean;
      collisionHitEntityId?: string;
      collisionHitPositionXYZ?: RuntimeVec3V1;
      collisionHitNormalXYZ?: RuntimeVec3V1;
      decollisionPhase?:
        | "clear"
        | "constrained"
        | "recovering"
        | "emergency-inside";
      startedOverlapping?: boolean;
      penetrationDepthMeters?: number;
      clearHoldRemainingSeconds?: number;
      positionLagXYZ?: RuntimeVec3V1;
      rotationLagRadiansXYZ?: RuntimeVec3V1;
      recenterRemainingSeconds?: number;
      fixedStepDeltaSeconds: number;
      resolvedParameters?: Readonly<CameraRigParametersV1>;
      previewParameterOverrides?: Readonly<Partial<CameraRigParametersV1>>;
      profileTransitionProgressRatio?: number;
      controlForwardXYZ?: RuntimeVec3V1;
      subjectForwardXYZ?: RuntimeVec3V1;
      subjectVelocityMetersPerSecondXYZ?: RuntimeVec3V1;
    }>;

export interface WorldRuntimeSubjectStateV4 {
  readonly entityState: SpatialEntityStateV1;
  readonly capabilityStatesById: Readonly<
    Record<string, GameplayCapabilityStateV1>
  >;
}

export interface WorldRuntimeSnapshotV4 {
  readonly kind: "worldkit-runtime-snapshot";
  readonly schemaVersion: 4;
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly world: {
    readonly publicationEpoch: number;
    readonly simulationTick: number;
    readonly worldStateRef: string;
    readonly worldStateHash: Sha256HashV1;
    readonly subjectStatesByEntityId: Readonly<
      Record<string, WorldRuntimeSubjectStateV4>
    >;
    readonly gameplayInspection: GameplayInspectionSnapshotV1;
  };
  readonly view: {
    readonly viewStateRevision: number;
    readonly camera: WorldRuntimeCameraStateV4;
  };
  readonly runtime: {
    readonly phase: "ready" | "failed" | "disposed";
    readonly isPaused: boolean;
    readonly fixedTimeStepSeconds: number;
  };
  readonly resources: {
    readonly phase: "ready" | "degraded" | "failed";
    readonly meshCount: number;
    readonly physicsBodyCount: number;
    readonly terrainSampleCount: number;
  };
}

export interface ApplyCameraPreviewRequestV1 {
  readonly tuningByProfileRef: Readonly<Record<string, Readonly<CameraTuningV1>>>;
}

export interface CameraPreviewStateV1 {
  readonly kind: "worldkit-camera-preview-state";
  readonly schemaVersion: 1;
  readonly activeCameraProfileRef: string;
  readonly activeCameraRigRef: string;
  readonly activeCameraModifierRefs: readonly string[];
  readonly tuningByProfileRef: Readonly<Record<string, Readonly<CameraTuningV1>>>;
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
  readonly positionMetersXYZ: RuntimeVec3V1;
  readonly forwardXYZ: RuntimeVec3V1;
  readonly upXYZ: RuntimeVec3V1;
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
  readonly snapshot: WorldRuntimeSnapshotV4;
  readonly semanticClasses: readonly ControlCaptureSemanticClassEntryV1[];
  readonly instances: readonly ControlCaptureInstanceEntryV1[];
  readonly passesById: Readonly<Record<ControlCapturePassIdV1, ControlCapturePassPayloadV1>>;
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
  kind:
    | "motion-profile"
    | "control-feel-profile"
    | "control-profile"
    | "camera-rig-profile";
  displayName: string;
  role?: "default" | "optional" | "fallback" | "feel" | "control" | "camera";
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

export const WORLDKIT_BROWSER_PROTOCOL_VERSION = 5 as const;
export const WORLDKIT_WORLD_SESSION_EVENT_PAGE_MAXIMUM_COUNT = 256 as const;

export interface WorldkitBrowserDiagnosticV1 {
  severity: "info" | "warning" | "error";
  code: string;
  instancePath: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

export type WorldSessionEventV1 = GameplayEventV1 | CameraViewEventV1;

export interface WorldSessionEventsQueryV1 {
  readonly afterEventSequence: number;
  readonly maximumEventCount: number;
}

export interface WorldSessionEventsQueryResultV1 {
  readonly events: readonly WorldSessionEventV1[];
  readonly nextAfterEventSequence: number;
  readonly hasMore: boolean;
}

/** Durable Runtime Session V1 currently replays Gameplay events only. */
export interface GameplayEventsQueryV1 {
  readonly afterEventSequence: number;
  readonly maximumEventCount: number;
}

export interface GameplayEventsQueryResultV1 {
  readonly events: readonly GameplayEventV1[];
  readonly nextAfterEventSequence: number;
  readonly hasMore: boolean;
}

export interface WorldStateSnapshotRequestV1 {
  readonly worldStateRef: string;
}

export type RuntimeActivityKindV1 =
  | "runtime-run"
  | "simulation-take"
  | "control-capture";

export interface RuntimeActivityRequestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly activityKind: RuntimeActivityKindV1;
  readonly expectedWorldSessionId: string;
}

interface RuntimeActivityReceiptBaseV1 {
  readonly kind: "worldkit-runtime-activity-receipt";
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly activityKind: RuntimeActivityKindV1;
  readonly worldSessionId: string;
  readonly runtimeActivityEpoch: number;
}

export type RuntimeActivityReceiptV1 =
  | (RuntimeActivityReceiptBaseV1 & Readonly<{
      status: "active" | "released" | "terminated-by-host";
    }>)
  | (RuntimeActivityReceiptBaseV1 & Readonly<{
      status: "rejected";
      diagnostic: GameplayDiagnosticV1;
    }>);

export interface WorldkitBrowserApiV5 {
  version: typeof WORLDKIT_BROWSER_PROTOCOL_VERSION;
  ready(): Promise<WorldRuntimeSnapshotV4>;
  getSnapshot(): WorldRuntimeSnapshotV4;
  getDiagnostics(): readonly WorldkitBrowserDiagnosticV1[];
  executeGameplayCommand(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1>;
  executeCameraViewCommand(
    command: CameraViewCommandV1,
  ): Promise<CameraViewCommandReceiptV1>;
  runFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV4>;
  getWorldSessionEvents(
    query: WorldSessionEventsQueryV1,
  ): WorldSessionEventsQueryResultV1;
  getGameplayInspectionSnapshot(): GameplayInspectionSnapshotV1;
  getWorldStateSnapshot(
    request: WorldStateSnapshotRequestV1,
  ): WorldStateSnapshotV1;
  acquireRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1;
  releaseRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1;
  getControlCaptureCapabilities(): ControlCaptureCapabilitiesV1;
  waitForSimulationTick(expectedSimulationTick: number): Promise<WorldRuntimeSnapshotV4>;
  waitForRenderReady(expectedSimulationTick: number): Promise<RenderReadyReceiptV1>;
  captureControlFrame(request: ControlCaptureRequestV1): Promise<RuntimeControlCaptureFrameV1>;
  captureScreenshot(): string;
  reset(): Promise<WorldRuntimeSnapshotV4>;
  setPaused(paused: boolean): WorldRuntimeSnapshotV4;
  listSubjectDefinitions(
    options?: CapabilityDiscoveryOptionsV1,
  ): readonly SubjectDefinitionSummaryV1[];
  listMotionKernels(
    options?: CapabilityDiscoveryOptionsV1,
  ): readonly MotionKernelSummaryV1[];
  listCompatibleProfiles(
    subjectDefinitionRef: string,
  ): readonly CompatibleProfileSummaryV1[];
  getSubjectPresetBaseline(
    subjectDefinitionRef: string,
  ): SubjectPresetBaselineV1;
  validateSubjectPackage(
    subjectDefinitionRef: string,
  ): SubjectPackageValidationResultV1;
  setIntent(input: FixedInputV1): Promise<WorldRuntimeSnapshotV4>;
  adjustCameraView(input: CameraViewInputV1): WorldRuntimeSnapshotV4;
  resetCameraView(): WorldRuntimeSnapshotV4;
  getCameraPreviewState(): CameraPreviewStateV1;
  applyCameraPreview(request: ApplyCameraPreviewRequestV1): CameraPreviewStateV1;
  applySubjectPresetTuning(
    request: ApplySubjectPresetTuningRequestV1,
  ): SubjectPresetTuningReceiptV1;
  setMotionProfile(
    subjectEntityId: string,
    motionProfileRef: string,
  ): Promise<WorldRuntimeSnapshotV4>;
  runHarness(subjectEntityId: string): Promise<SubjectHarnessReportV1>;
  getSubjectSnapshot(subjectEntityId: string): WorldRuntimeSubjectStateV4 | undefined;
  getCameraSnapshot(): WorldRuntimeCameraStateV4;
  getRouteSummary(selector: RouteEvidenceSelectorV1): RouteSummaryQueryResultV1;
  getRoutePathReceipt(
    selector: RouteEvidenceSelectorV1,
  ): RoutePathReceiptQueryResultV2;
  getRouteRuntimeProbeReceipt(
    selector: RouteEvidenceSelectorV1,
  ): RouteRuntimeProbeReceiptQueryResultV2;
  getRouteOverlay(selector: RouteEvidenceSelectorV1): RouteOverlayQueryResultV2;
}
