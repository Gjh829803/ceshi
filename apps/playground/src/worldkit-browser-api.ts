import type { SubjectAssetRuntimeErrorCodeV1 } from "@whitebox-world/runtime-babylon";
import type {
  GameplayCommandReceiptV1,
  GameplayCommandV1,
  GameplayInspectionSnapshotV1,
  WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import { isNil } from "lodash-es";
import {
  builtInSubjectDefaultRegistry,
  builtInSubjectResourceRegistry,
  resolveSubjectPresetClosureV1,
  selectableControlFeelProfileRefsV1,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";
import {
  CAMERA_TUNING_SAFETY_LIMITS_V1,
  CONTROL_FEEL_PARAMETER_BOUNDS_V1,
  CONTROL_FEEL_PARAMETER_NAMES_V1,
  WORLDKIT_WORLD_SESSION_EVENT_PAGE_MAXIMUM_COUNT,
  WORLDKIT_BROWSER_PROTOCOL_VERSION,
  canonicalWorldkitBrowserRouteEvidencePublicationV2,
  canonicalRouteEvidenceSelectorV1,
  type ApplyCameraPreviewRequestV1,
  type ApplySubjectPresetTuningRequestV1,
  type CameraPreviewStateV1,
  type CameraViewCommandReceiptV1,
  type CameraViewCommandV1,
  type CameraViewPreferenceV1,
  type CameraViewInputV1,
  type CompatibleProfileSummaryV1,
  type ControlCaptureCapabilitiesV1,
  type ControlCaptureRequestV1,
  type FixedInputV1,
  type RenderReadyReceiptV1,
  type RouteEvidenceSelectorV1,
  type RouteEvidenceUnavailableResultV1,
  type RouteEvidenceUnavailableReasonV1,
  type RouteSummaryQueryResultV1,
  type RoutePathReceiptQueryResultV2,
  type RouteRuntimeProbeReceiptQueryResultV2,
  type RouteOverlayQueryResultV2,
  type WorldkitBrowserRouteEvidenceProjectionV2,
  type WorldkitBrowserRouteEvidencePublicationV2,
  type RuntimeControlCaptureFrameV1,
  type RuntimeActivityRequestV1,
  type RuntimeActivityReceiptV1,
  type WorldRuntimeSnapshotV4,
  type WorldSessionEventV1,
  type SubjectHarnessReportV1,
  type SubjectPresetTuningReceiptV1,
  type WorldkitBrowserApiV5,
  type WorldkitBrowserDiagnosticV1,
} from "@whitebox-world/runtime-contracts";

export interface DeferredWorldkitBrowserRuntimeAdapterV1 {
  runtimeDiagnostics(): readonly WorldkitBrowserDiagnosticV1[];
  runtimeSnapshot(): WorldRuntimeSnapshotV4;
  executeGameplayCommandRuntime(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1>;
  executeCameraViewCommandRuntime(
    command: CameraViewCommandV1,
  ): Promise<CameraViewCommandReceiptV1>;
  runWorldkitFixedInput(
    steps: readonly FixedInputV1[],
  ): Promise<WorldRuntimeSnapshotV4>;
  worldSessionEventsAfterRuntime(
    afterEventSequence: number,
    maximumEventCount: number,
  ): readonly WorldSessionEventV1[];
  gameplayInspectionSnapshotRuntime(): GameplayInspectionSnapshotV1;
  worldStateSnapshotRuntime(
    worldStateRef: string,
  ): WorldStateSnapshotV1 | undefined;
  acquireRuntimeActivityRuntime(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1;
  releaseRuntimeActivityRuntime(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1;
  getControlCaptureCapabilities(): ControlCaptureCapabilitiesV1;
  waitForSimulationTick(expectedSimulationTick: number): Promise<WorldRuntimeSnapshotV4>;
  waitForRenderReady(expectedSimulationTick: number): Promise<RenderReadyReceiptV1>;
  captureControlFrame(request: ControlCaptureRequestV1): Promise<RuntimeControlCaptureFrameV1>;
  captureScreenshot(): string;
  resetRuntime(): Promise<WorldRuntimeSnapshotV4>;
  setPaused(paused: boolean): void;
  disposeRuntime(): Promise<void>;
  adjustCameraViewRuntime(input: CameraViewInputV1): WorldRuntimeSnapshotV4;
  resetCameraViewRuntime(): WorldRuntimeSnapshotV4;
  getCameraPreviewStateRuntime(): CameraPreviewStateV1;
  applyCameraPreviewRuntime(request: ApplyCameraPreviewRequestV1): CameraPreviewStateV1;
  applySubjectPresetTuningRuntime(
    request: ApplySubjectPresetTuningRequestV1,
  ): SubjectPresetTuningReceiptV1;
  runSubjectHarness(subjectEntityId: string): Promise<SubjectHarnessReportV1>;
  setMotionProfileRuntime(
    subjectEntityId: string,
    motionProfileRef: string,
  ): Promise<WorldRuntimeSnapshotV4>;
}

interface WorldkitBrowserApiTargetV1 {
  __WORLDKIT__?: WorldkitBrowserApiV5;
}

interface WorldkitBrowserStatusTargetV1 {
  dataset: { worldkitStatus?: string };
}

export interface DeferredWorldkitBrowserInitializationContextV1 {
  trackAdapter(adapter: DeferredWorldkitBrowserRuntimeAdapterV1): void;
}

export interface DeferredWorldkitBrowserApiInstallationV1 {
  readonly api: WorldkitBrowserApiV5;
  readonly initialization: Promise<
    DeferredWorldkitBrowserRuntimeAdapterV1 | undefined
  >;
  dispose(): Promise<void>;
}

class WorldkitBrowserStartupErrorV1 extends Error {
  readonly name = "WorldkitBrowserStartupErrorV1";

  constructor(
    readonly code: string,
    readonly diagnostic: WorldkitBrowserDiagnosticV1,
  ) {
    super(diagnostic.message);
  }
}

class WorldkitBrowserBoundaryErrorV1 extends Error {
  readonly name = "WorldkitBrowserBoundaryErrorV1";

  constructor(
    readonly code: string,
    readonly diagnostic: WorldkitBrowserDiagnosticV1,
  ) {
    super(diagnostic.message);
  }
}

function boundaryError(
  code: string,
  message: string,
): WorldkitBrowserBoundaryErrorV1 {
  return new WorldkitBrowserBoundaryErrorV1(code, Object.freeze({
    severity: "error",
    code,
    instancePath: "",
    message,
  }));
}

function callAdapter<T>(
  code: string,
  message: string,
  operation: () => T,
): T {
  try {
    return operation();
  } catch {
    throw boundaryError(code, message);
  }
}

async function callAdapterAsync<T>(
  code: string,
  message: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    throw boundaryError(code, message);
  }
}

function notReadyError(): WorldkitBrowserStartupErrorV1 {
  const diagnostic: WorldkitBrowserDiagnosticV1 = Object.freeze({
    severity: "error",
    code: "WORLDKIT_RUNTIME_NOT_READY",
    instancePath: "",
    message: "Worldkit runtime is not ready.",
  });
  return new WorldkitBrowserStartupErrorV1(
    "WORLDKIT_RUNTIME_NOT_READY",
    diagnostic,
  );
}

function genericStartupError(): WorldkitBrowserStartupErrorV1 {
  const diagnostic: WorldkitBrowserDiagnosticV1 = Object.freeze({
    severity: "error",
    code: "WORLDKIT_RUNTIME_INITIALIZATION_FAILED",
    instancePath: "",
    message: "Worldkit runtime initialization failed.",
  });
  return new WorldkitBrowserStartupErrorV1(
    "WORLDKIT_RUNTIME_INITIALIZATION_FAILED",
    diagnostic,
  );
}

function resetInProgressError(): WorldkitBrowserBoundaryErrorV1 {
  return boundaryError(
    "WORLDKIT_RUNTIME_RESET_IN_PROGRESS",
    "Worldkit runtime reset is in progress.",
  );
}

function exactDataRecord(
  input: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  if (typeof input !== "object" || isNil(input)) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(input);
    if (prototype !== Object.prototype && !isNil(prototype)) return undefined;
    const ownKeys = Reflect.ownKeys(input);
    if (
      ownKeys.length !== expectedKeys.length ||
      ownKeys.some((key) =>
        typeof key !== "string" || !expectedKeys.includes(key)
      )
    ) return undefined;
    const record: Record<string, unknown> = {};
    for (const key of expectedKeys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return undefined;
  }
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}

function parseWorldSessionEventsQuery(input: unknown): Readonly<{
  afterEventSequence: number;
  maximumEventCount: number;
}> {
  const record = exactDataRecord(input, [
    "afterEventSequence",
    "maximumEventCount",
  ]);
  if (
    isNil(record) ||
    !Number.isSafeInteger(record.afterEventSequence) ||
    (record.afterEventSequence as number) < 0 ||
    !Number.isSafeInteger(record.maximumEventCount) ||
    (record.maximumEventCount as number) < 1 ||
    (record.maximumEventCount as number) >
      WORLDKIT_WORLD_SESSION_EVENT_PAGE_MAXIMUM_COUNT
  ) throw boundaryError(
    "WORLDKIT_GAMEPLAY_EVENTS_QUERY_INVALID",
    "Gameplay Event query is invalid.",
  );
  return Object.freeze({
    afterEventSequence: record.afterEventSequence as number,
    maximumEventCount: record.maximumEventCount as number,
  });
}

function validateWorldSessionEventLookaheadPage(
  input: readonly WorldSessionEventV1[],
  query: Readonly<{
    afterEventSequence: number;
    maximumEventCount: number;
  }>,
  runtimeSessionId: string,
  worldSessionId: string,
): void {
  try {
    if (!Array.isArray(input) || input.length > query.maximumEventCount + 1) {
      throw boundaryError(
        "WORLDKIT_GAMEPLAY_EVENTS_PROTOCOL_INVALID",
        "Gameplay Event publication violated the Browser protocol.",
      );
    }
    let previousSequence = query.afterEventSequence;
    for (const event of input) {
      if (
        !Number.isSafeInteger(event.sequence) ||
        event.sequence <= previousSequence ||
        event.runtimeSessionId !== runtimeSessionId ||
        event.worldSessionId !== worldSessionId
      ) throw boundaryError(
        "WORLDKIT_GAMEPLAY_EVENTS_PROTOCOL_INVALID",
        "Gameplay Event publication violated the Browser protocol.",
      );
      previousSequence = event.sequence;
    }
  } catch (error) {
    if (error instanceof WorldkitBrowserBoundaryErrorV1) throw error;
    throw boundaryError(
      "WORLDKIT_GAMEPLAY_EVENTS_PROTOCOL_INVALID",
      "Gameplay Event publication violated the Browser protocol.",
    );
  }
}

function parseWorldStateSnapshotRequest(input: unknown): Readonly<{
  worldStateRef: string;
}> {
  const record = exactDataRecord(input, ["worldStateRef"]);
  if (isNil(record) || !isNonEmptyString(record.worldStateRef)) {
    throw boundaryError(
      "WORLDKIT_WORLD_STATE_SNAPSHOT_REQUEST_INVALID",
      "World State snapshot request is invalid.",
    );
  }
  if (!/^worldkit:\/\/world-state\/world-state:[a-f0-9]{64}$/.test(
    record.worldStateRef,
  )) throw boundaryError(
    "WORLDKIT_WORLD_STATE_SNAPSHOT_REQUEST_INVALID",
    "World State snapshot request is invalid.",
  );
  return Object.freeze({ worldStateRef: record.worldStateRef });
}

const RUNTIME_ACTIVITY_KINDS = new Set<RuntimeActivityRequestV1["activityKind"]>([
  "runtime-run",
  "simulation-take",
  "control-capture",
]);

function parseRuntimeActivityRequest(
  input: unknown,
): RuntimeActivityRequestV1 {
  const record = exactDataRecord(input, [
    "schemaVersion",
    "id",
    "activityKind",
    "expectedWorldSessionId",
  ]);
  if (
    isNil(record) ||
    record.schemaVersion !== 1 ||
    !isNonEmptyString(record.id) ||
    typeof record.activityKind !== "string" ||
    !RUNTIME_ACTIVITY_KINDS.has(
      record.activityKind as RuntimeActivityRequestV1["activityKind"],
    ) ||
    !isNonEmptyString(record.expectedWorldSessionId)
  ) throw boundaryError(
    "WORLDKIT_RUNTIME_ACTIVITY_REQUEST_INVALID",
    "Runtime Activity request is invalid.",
  );
  return Object.freeze({
    schemaVersion: 1,
    id: record.id,
    activityKind:
      record.activityKind as RuntimeActivityRequestV1["activityKind"],
    expectedWorldSessionId: record.expectedWorldSessionId,
  });
}

async function sanitizeStartupError(
  error: unknown,
): Promise<WorldkitBrowserStartupErrorV1> {
  let guardedCode:
    | SubjectAssetRuntimeErrorCodeV1
    | "WORLDKIT_LAYOUT_ASSERTION_FAILED"
    | undefined;
  try {
    const {
      isSubjectAssetRuntimeErrorV1,
      isWorldRuntimeLayoutAssertionErrorV1,
    } = await import(
      "@whitebox-world/runtime-babylon"
    );
    if (isSubjectAssetRuntimeErrorV1(error)) guardedCode = error.code;
    else if (isWorldRuntimeLayoutAssertionErrorV1(error)) {
      guardedCode = error.code;
    }
  } catch {
    return genericStartupError();
  }
  if (guardedCode === undefined) return genericStartupError();
  const diagnostic: WorldkitBrowserDiagnosticV1 = Object.freeze({
    severity: "error",
    code: guardedCode,
    instancePath: "",
    message: guardedCode === "WORLDKIT_LAYOUT_ASSERTION_FAILED"
      ? "Worldkit layout assertion validation failed."
      : "Subject Asset runtime initialization failed.",
  });
  return new WorldkitBrowserStartupErrorV1(guardedCode, diagnostic);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function unavailableRouteEvidenceResult(
  selector: RouteEvidenceSelectorV1,
  reason: RouteEvidenceUnavailableReasonV1,
): RouteEvidenceUnavailableResultV1 {
  return deepFreeze({
    kind: "worldkit-route-evidence-query-result",
    schemaVersion: 1,
    availability: "unavailable",
    selector: structuredClone(selector),
    reason,
  });
}

function routeEvidenceKey(selector: RouteEvidenceSelectorV1): string {
  return `${selector.constraintId.length}:${selector.constraintId}${selector.routeId}`;
}

function createRouteEvidenceByKey(
  publication: WorldkitBrowserRouteEvidencePublicationV2 | undefined,
): ReadonlyMap<string, WorldkitBrowserRouteEvidenceProjectionV2> | undefined {
  if (publication === undefined) return undefined;
  const canonical = canonicalWorldkitBrowserRouteEvidencePublicationV2(
    publication,
  );
  const byKey = new Map<string, WorldkitBrowserRouteEvidenceProjectionV2>();
  for (const projection of canonical.routes) {
    const key = routeEvidenceKey(projection.selector);
    byKey.set(key, projection);
  }
  return byKey;
}

function immutableBrowserCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function validateSubjectPackageAgainstRegistry(
  registry: SubjectResourceRegistryV3,
  subjectDefinitionRef: string,
): {
  valid: boolean;
  subjectDefinitionRef: string;
  diagnostics: readonly { code: string; message: string }[];
} {
  const definition = registry.resolveSubjectDefinition(subjectDefinitionRef);
  const diagnostics: { code: string; message: string }[] = [];
  const missing = (resourceRef: string, kind: string): void => {
    diagnostics.push({
      code: "SUBJECT_RESOURCE_NOT_FOUND",
      message: `${kind} '${resourceRef}' is not registered at the exact requested version.`,
    });
  };
  if (definition === undefined || !("schemaVersion" in definition)) {
    diagnostics.push({
      code: "SUBJECT_PACKAGE_NOT_FOUND",
      message: "The exact capability-driven Subject Definition is not registered.",
    });
    return { valid: false, subjectDefinitionRef, diagnostics };
  }

  const motionProfileRefs = [...new Set([
    definition.profiles.motion.defaultMotionProfileRef,
    ...definition.profiles.motion.optionalMotionProfileRefs,
    definition.profiles.motion.fallbackMotionProfileRef,
  ])].sort((left, right) => left.localeCompare(right));
  const motionProfiles = motionProfileRefs.flatMap((resourceRef) => {
    const resource = registry.resolveMotionProfile(resourceRef);
    if (resource === undefined) missing(resourceRef, "Motion Profile");
    return resource === undefined ? [] : [resource];
  });
  const motionKernels = [...new Set(motionProfiles.map((profile) => profile.motionKernelRef))]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((resourceRef) => {
      const resource = registry.resolveMotionKernel(resourceRef);
      if (resource === undefined) missing(resourceRef, "Motion Kernel");
      return resource === undefined ? [] : [resource];
    });
  const control = registry.resolveControlProfile(definition.profiles.controlProfileRef);
  if (control === undefined) missing(definition.profiles.controlProfileRef, "Control Profile");
  for (const kernel of motionKernels) {
    if (kernel.runtimeStatus === "implemented") continue;
    diagnostics.push({
      code: "SUBJECT_KERNEL_NOT_IMPLEMENTED",
      message: `Motion Kernel '${kernel.resourceRef}' is not installed in the canonical runtime.`,
    });
  }
  const defaultMotion = registry.resolveMotionProfile(
    definition.profiles.motion.defaultMotionProfileRef,
  );
  const defaultKernel = defaultMotion === undefined
    ? undefined
    : registry.resolveMotionKernel(defaultMotion.motionKernelRef);
  if (
    defaultKernel !== undefined &&
    control !== undefined &&
    defaultKernel.commandKind !== control.commandKind
  ) {
    diagnostics.push({
      code: "SUBJECT_COMMAND_KIND_MISMATCH",
      message: "Control Profile and Motion Kernel command kinds do not match.",
    });
  }

  const cameraContext = registry.resolveCameraContextProfile(
    definition.profiles.cameraContextProfileRef,
  );
  if (cameraContext === undefined) {
    missing(definition.profiles.cameraContextProfileRef, "Camera Context Profile");
  } else {
    const cameraRigProfileRefs = [...new Set([
      cameraContext.defaultCameraRigProfileRef,
      cameraContext.firstPersonCameraRigProfileRef,
      ...cameraContext.rules.map((rule) => rule.cameraRigProfileRef),
    ].filter((resourceRef): resourceRef is string => resourceRef !== undefined))]
      .sort((left, right) => left.localeCompare(right));
    const cameraRigProfiles = cameraRigProfileRefs.flatMap((resourceRef) => {
      const resource = registry.resolveCameraRigProfile(resourceRef);
      if (resource === undefined) missing(resourceRef, "Camera Rig Profile");
      return resource === undefined ? [] : [resource];
    });
    for (const algorithmRef of [...new Set(
      cameraRigProfiles.map((profile) => profile.algorithmRef),
    )].sort((left, right) => left.localeCompare(right))) {
      const algorithm = registry.resolveCameraRigAlgorithm(algorithmRef);
      if (algorithm === undefined) missing(algorithmRef, "Camera Rig Algorithm");
      else if (algorithm.runtimeStatus !== "implemented") {
        diagnostics.push({
          code: "SUBJECT_CAMERA_RUNTIME_NOT_IMPLEMENTED",
          message: `Camera Rig Algorithm '${algorithmRef}' is not installed in the canonical runtime.`,
        });
      }
    }
  }

  if (registry.resolveMediumProfile(definition.profiles.mediumProfileRef) === undefined) {
    missing(definition.profiles.mediumProfileRef, "Medium Profile");
  }
  if (registry.resolveHarnessProfile(definition.profiles.harnessProfileRef) === undefined) {
    missing(definition.profiles.harnessProfileRef, "Harness Profile");
  }
  if (
    registry.resolvePoseSetProfile(definition.actionOrPoseSetRef) === undefined &&
    registry.resolveAnimationSet(definition.actionOrPoseSetRef) === undefined
  ) {
    missing(definition.actionOrPoseSetRef, "Action or Pose Set");
  }
  if (registry.resolveRenderBindingProfile(definition.renderBindingProfileRef) === undefined) {
    missing(definition.renderBindingProfileRef, "Render Binding Profile");
  }

  const relationshipProfileRefByCapabilityRef: Readonly<Record<string, string>> = {
    "worldkit://capability/relationship.mounted-on@1":
      "worldkit://relationship-profile/mounted-on.stand-ground@1",
    "worldkit://capability/relationship.seat@1":
      "worldkit://relationship-profile/seat.driver@1",
    "worldkit://capability/relationship.tether@1":
      "worldkit://relationship-profile/tether.standard@1",
  };
  for (const capabilityRef of definition.relationshipCapabilityRefs) {
    const relationshipProfileRef = relationshipProfileRefByCapabilityRef[capabilityRef];
    const relationshipProfile = relationshipProfileRef === undefined
      ? undefined
      : registry.resolveRelationshipProfile(relationshipProfileRef);
    if (relationshipProfileRef === undefined || relationshipProfile === undefined) {
      missing(relationshipProfileRef ?? capabilityRef, "Relationship Profile");
      continue;
    }
    diagnostics.push({
      code: "SUBJECT_RELATIONSHIP_NOT_IMPLEMENTED",
      message: `Relationship behavior '${relationshipProfile.relationshipType}' is unavailable in the canonical runtime.`,
    });
  }
  return { valid: diagnostics.length === 0, subjectDefinitionRef, diagnostics };
}

/**
 * Playground-local authoring metadata. Numeric Feel/Control values are used to
 * build drafts and promotion candidates; they are deliberately not part of the
 * Browser runtime protocol returned by `listCompatibleProfiles`.
 */
export function listSubjectPresetAuthoringProfilesV1(
  subjectDefinitionRef: string,
): readonly CompatibleProfileSummaryV1[] {
  const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
    subjectDefinitionRef,
  );
  if (definition === undefined || !("schemaVersion" in definition)) return [];
  const motionRefs = new Set([
    definition.profiles.motion.defaultMotionProfileRef,
    ...definition.profiles.motion.optionalMotionProfileRefs,
    definition.profiles.motion.fallbackMotionProfileRef,
  ]);
  const cameraContext = builtInSubjectResourceRegistry.resolveCameraContextProfile(
    definition.profiles.cameraContextProfileRef,
  );
  const cameraRefs = new Set<string>();
  if (cameraContext !== undefined) {
    cameraRefs.add(cameraContext.defaultCameraRigProfileRef);
    if (cameraContext.firstPersonCameraRigProfileRef !== undefined) {
      cameraRefs.add(cameraContext.firstPersonCameraRigProfileRef);
    }
    cameraContext.rules.forEach((rule) => {
      if (rule.cameraRigProfileRef !== undefined) {
        cameraRefs.add(rule.cameraRigProfileRef);
      }
    });
  }
  const controlFeelRefs = selectableControlFeelProfileRefsV1(definition.profiles);
  return [
    ...[...motionRefs].flatMap((resourceRef) => {
      const resource = builtInSubjectResourceRegistry.resolveMotionProfile(resourceRef);
      return resource === undefined
        ? []
        : [{
            resourceRef,
            contentHash: resource.contentHash,
            kind: "motion-profile" as const,
            displayName: resource.aiMetadata.displayName,
            role: resourceRef === definition.profiles.motion.defaultMotionProfileRef
              ? "default" as const
              : resourceRef === definition.profiles.motion.fallbackMotionProfileRef
                ? "fallback" as const
                : "optional" as const,
          }];
    }),
    ...controlFeelRefs.flatMap((resourceRef) => {
      const resource = builtInSubjectResourceRegistry.resolveControlFeelProfile(resourceRef);
      return resource === undefined
        ? []
        : [{
            resourceRef,
            contentHash: resource.contentHash,
            kind: "control-feel-profile" as const,
            displayName: resource.aiMetadata.displayName,
            role: resourceRef === definition.profiles.controlFeelProfileRef
              ? "default" as const
              : "optional" as const,
            parameters: Object.fromEntries(
              CONTROL_FEEL_PARAMETER_NAMES_V1.map((name) => [name, resource[name]]),
            ),
            safetyLimits: CONTROL_FEEL_PARAMETER_BOUNDS_V1,
            authoringRanges: Object.fromEntries(
              CONTROL_FEEL_PARAMETER_NAMES_V1.map((name) => {
                const bounds = CONTROL_FEEL_PARAMETER_BOUNDS_V1[name];
                return [name, {
                  ...bounds,
                  step: Math.max(0.01, (bounds.maximum - bounds.minimum) / 100),
                }];
              }),
            ),
            draftOnlyParameterNames: CONTROL_FEEL_PARAMETER_NAMES_V1,
          }];
    }),
    ...(() => {
      const resource = builtInSubjectResourceRegistry.resolveControlProfile(
        definition.profiles.controlProfileRef,
      );
      return resource === undefined
        ? []
        : [{
            resourceRef: resource.resourceRef,
            contentHash: resource.contentHash,
            kind: "control-profile" as const,
            displayName: resource.aiMetadata.displayName,
            role: "control" as const,
            parameters: { moveDeadzoneRatio: resource.moveDeadzoneRatio },
            safetyLimits: {
              moveDeadzoneRatio: { minimum: 0, maximum: 0.4 },
            },
            authoringRanges: {
              moveDeadzoneRatio: { minimum: 0, maximum: 0.4, step: 0.01 },
            },
            draftOnlyParameterNames: ["moveDeadzoneRatio"],
          }];
    })(),
    ...[...cameraRefs].flatMap((resourceRef) => {
      const resource = builtInSubjectResourceRegistry.resolveCameraRigProfile(resourceRef);
      return resource === undefined
        ? []
        : [{
            resourceRef,
            contentHash: resource.contentHash,
            kind: "camera-rig-profile" as const,
            displayName: resource.aiMetadata.displayName,
            role: "camera" as const,
            baseMode: resource.baseMode,
            headingSource: resource.headingSource,
            recenterMode: resource.recenterMode,
            parameters: resource.parameters,
            safetyLimits: CAMERA_TUNING_SAFETY_LIMITS_V1,
            ...(resource.authoringRanges === undefined
              ? {}
              : { authoringRanges: resource.authoringRanges }),
          }];
    }),
  ].sort((left, right) => left.resourceRef.localeCompare(right.resourceRef));
}

function runtimeProfileDiscoverySummaryV1(
  profile: CompatibleProfileSummaryV1,
): CompatibleProfileSummaryV1 {
  if (
    profile.kind !== "control-feel-profile" &&
    profile.kind !== "control-profile"
  ) return profile;
  return {
    resourceRef: profile.resourceRef,
    contentHash: profile.contentHash,
    kind: profile.kind,
    displayName: profile.displayName,
    ...(profile.role === undefined ? {} : { role: profile.role }),
  };
}

export function installDeferredWorldkitBrowserApi(options: {
  target: WorldkitBrowserApiTargetV1;
  statusElement: WorldkitBrowserStatusTargetV1;
  routeEvidencePublication?: WorldkitBrowserRouteEvidencePublicationV2;
  startupFailureDiagnostics?: readonly WorldkitBrowserDiagnosticV1[];
  initialize(
    context: DeferredWorldkitBrowserInitializationContextV1,
  ): Promise<DeferredWorldkitBrowserRuntimeAdapterV1>;
}): DeferredWorldkitBrowserApiInstallationV1 {
  const routeEvidenceByKey = createRouteEvidenceByKey(
    options.routeEvidencePublication,
  );
  const startupFailureDiagnostics = options.startupFailureDiagnostics === undefined
    ? undefined
    : Object.freeze(
        options.startupFailureDiagnostics.map((diagnostic) =>
          deepFreeze(structuredClone(diagnostic)),
        ),
      );
  if (startupFailureDiagnostics?.length === 0) {
    throw new Error("WORLDKIT_STARTUP_FAILURE_DIAGNOSTICS_EMPTY");
  }
  let state: "loading" | "ready" | "error" = "loading";
  let trackedAdapter: DeferredWorldkitBrowserRuntimeAdapterV1 | undefined;
  let adapterDisposed = false;
  let resetInProgress = false;
  let startupError: WorldkitBrowserStartupErrorV1 | undefined;
  let diagnostics: readonly WorldkitBrowserDiagnosticV1[] = Object.freeze([]);
  let resolveReady!: (snapshot: WorldRuntimeSnapshotV4) => void;
  let rejectReady!: (error: WorldkitBrowserStartupErrorV1) => void;
  const startupPromise = new Promise<WorldRuntimeSnapshotV4>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void startupPromise.catch(() => undefined);

  const requireReadyAdapter = (): DeferredWorldkitBrowserRuntimeAdapterV1 => {
    if (state === "loading") throw notReadyError();
    if (state === "error") throw startupError;
    if (resetInProgress) throw resetInProgressError();
    if (trackedAdapter === undefined) throw genericStartupError();
    return trackedAdapter;
  };

  const findRouteEvidence = (
    value: RouteEvidenceSelectorV1,
  ): Readonly<{
    selector: RouteEvidenceSelectorV1;
    projection?: WorldkitBrowserRouteEvidenceProjectionV2;
    unavailableReason?: RouteEvidenceUnavailableReasonV1;
  }> => {
    const selector = canonicalRouteEvidenceSelectorV1(value);
    if (routeEvidenceByKey === undefined) {
      return { selector, unavailableReason: "route-evidence-not-loaded" };
    }
    const projection = routeEvidenceByKey.get(routeEvidenceKey(selector));
    return projection === undefined
      ? { selector, unavailableReason: "route-not-found" }
      : { selector, projection };
  };

  const unavailableFromLookup = (
    lookup: ReturnType<typeof findRouteEvidence>,
    reason: RouteEvidenceUnavailableReasonV1 = "evidence-not-published",
  ): RouteEvidenceUnavailableResultV1 => unavailableRouteEvidenceResult(
    lookup.selector,
    lookup.unavailableReason ?? reason,
  );

  const api: WorldkitBrowserApiV5 = {
    version: WORLDKIT_BROWSER_PROTOCOL_VERSION,
    ready: () => startupPromise,
    getSnapshot: () => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_RUNTIME_SNAPSHOT_FAILED",
        "Worldkit runtime snapshot failed.",
        () => adapter.runtimeSnapshot(),
      );
    },
    getDiagnostics: () => diagnostics,
    executeGameplayCommand: async (command) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      return callAdapterAsync(
        "WORLDKIT_GAMEPLAY_COMMAND_EXECUTION_FAILED",
        "Gameplay command execution failed.",
        () => adapter.executeGameplayCommandRuntime(command),
      );
    },
    executeCameraViewCommand: async (command) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      return callAdapterAsync(
        "WORLDKIT_CAMERA_VIEW_COMMAND_EXECUTION_FAILED",
        "Camera View command execution failed.",
        () => adapter.executeCameraViewCommandRuntime(command),
      );
    },
    runFixedInput: async (steps) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      return callAdapterAsync(
        "WORLDKIT_FIXED_INPUT_EXECUTION_FAILED",
        "Fixed Input execution failed.",
        () => adapter.runWorldkitFixedInput(steps),
      );
    },
    getWorldSessionEvents: (input) => {
      const query = parseWorldSessionEventsQuery(input);
      const adapter = requireReadyAdapter();
      const current = callAdapter(
        "WORLDKIT_RUNTIME_SNAPSHOT_FAILED",
        "Worldkit runtime snapshot failed.",
        () => adapter.runtimeSnapshot(),
      );
      const pageWithLookahead = callAdapter(
        "WORLDKIT_GAMEPLAY_EVENTS_QUERY_FAILED",
        "Gameplay Event query failed.",
        () => adapter.worldSessionEventsAfterRuntime(
          query.afterEventSequence,
          query.maximumEventCount + 1,
        ),
      );
      validateWorldSessionEventLookaheadPage(
        pageWithLookahead,
        query,
        current.runtimeSessionId,
        current.worldSessionId,
      );
      const hasMore = pageWithLookahead.length > query.maximumEventCount;
      const events = callAdapter(
        "WORLDKIT_GAMEPLAY_EVENTS_PROTOCOL_INVALID",
        "Gameplay Event publication violated the Browser protocol.",
        () => immutableBrowserCopy(
          pageWithLookahead.slice(0, query.maximumEventCount),
        ),
      );
      const lastEvent = events.at(-1);
      return Object.freeze({
        events,
        nextAfterEventSequence: lastEvent?.sequence ?? query.afterEventSequence,
        hasMore,
      });
    },
    getGameplayInspectionSnapshot: () => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_GAMEPLAY_INSPECTION_FAILED",
        "Gameplay inspection failed.",
        () => adapter.gameplayInspectionSnapshotRuntime(),
      );
    },
    getWorldStateSnapshot: (input) => {
      const request = parseWorldStateSnapshotRequest(input);
      const adapter = requireReadyAdapter();
      const snapshot = callAdapter(
        "WORLDKIT_WORLD_STATE_SNAPSHOT_QUERY_FAILED",
        "World State snapshot query failed.",
        () => adapter.worldStateSnapshotRuntime(request.worldStateRef),
      );
      const current = callAdapter(
        "WORLDKIT_RUNTIME_SNAPSHOT_FAILED",
        "Worldkit runtime snapshot failed.",
        () => adapter.runtimeSnapshot(),
      );
      if (
        isNil(snapshot) ||
        `worldkit://world-state/${snapshot.id}` !== request.worldStateRef ||
        snapshot.runtimeSessionId !== current.runtimeSessionId ||
        snapshot.worldSessionId !== current.worldSessionId
      ) throw boundaryError(
        "WORLDKIT_WORLD_STATE_SNAPSHOT_NOT_FOUND",
        "World State snapshot is not retained in the active World Session.",
      );
      return snapshot;
    },
    acquireRuntimeActivity: (input) => {
      const adapter = requireReadyAdapter();
      const request = parseRuntimeActivityRequest(input);
      return callAdapter(
        "WORLDKIT_RUNTIME_ACTIVITY_OPERATION_FAILED",
        "Runtime Activity operation failed.",
        () => adapter.acquireRuntimeActivityRuntime(request),
      );
    },
    releaseRuntimeActivity: (input) => {
      const adapter = requireReadyAdapter();
      const request = parseRuntimeActivityRequest(input);
      return callAdapter(
        "WORLDKIT_RUNTIME_ACTIVITY_OPERATION_FAILED",
        "Runtime Activity operation failed.",
        () => adapter.releaseRuntimeActivityRuntime(request),
      );
    },
    getControlCaptureCapabilities: () => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_CONTROL_CAPTURE_CAPABILITIES_FAILED",
        "Control Capture capability query failed.",
        () => adapter.getControlCaptureCapabilities(),
      );
    },
    waitForSimulationTick: async (expectedSimulationTick) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      return callAdapterAsync(
        "WORLDKIT_SIMULATION_WAIT_FAILED",
        "Simulation Tick wait failed.",
        () => adapter.waitForSimulationTick(expectedSimulationTick),
      );
    },
    waitForRenderReady: async (expectedSimulationTick) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      return callAdapterAsync(
        "WORLDKIT_RENDER_WAIT_FAILED",
        "Render readiness wait failed.",
        () => adapter.waitForRenderReady(expectedSimulationTick),
      );
    },
    captureControlFrame: async (request) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      return callAdapterAsync(
        "WORLDKIT_CONTROL_CAPTURE_FAILED",
        "Control Capture failed.",
        () => adapter.captureControlFrame(request),
      );
    },
    captureScreenshot: () => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_SCREENSHOT_CAPTURE_FAILED",
        "Screenshot capture failed.",
        () => adapter.captureScreenshot(),
      );
    },
    reset: () => {
      const adapter = requireReadyAdapter();
      resetInProgress = true;
      return callAdapterAsync(
        "WORLDKIT_RUNTIME_RESET_FAILED",
        "Worldkit runtime reset failed.",
        () => adapter.resetRuntime(),
      ).finally(() => {
        resetInProgress = false;
      });
    },
    setPaused: (paused) => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_PAUSE_OPERATION_FAILED",
        "Runtime pause operation failed.",
        () => {
          adapter.setPaused(paused);
          return adapter.runtimeSnapshot();
        },
      );
    },
    listSubjectDefinitions: (options = {}) =>
      builtInSubjectDefaultRegistry.listPublicDefaults()
        .flatMap((entry) => {
          const definition = builtInSubjectResourceRegistry.resolveResource(
            entry.subjectDefinitionRef,
          );
          return definition?.kind === "subject-definition" &&
            "schemaVersion" in definition
            ? [definition]
            : [];
        })
        .filter(
          (definition) =>
            options.includeExperimental === true ||
            definition.authoringAvailability !== "experimental",
        )
        .map((capabilityDriven) => {
          return {
            resourceRef: capabilityDriven.resourceRef,
            contentHash: capabilityDriven.contentHash,
            displayName: capabilityDriven.aiMetadata.displayName,
            semanticClassId: capabilityDriven.semanticClassId,
            bodyTopology: capabilityDriven.bodyTopology,
            authoringAvailability: capabilityDriven.authoringAvailability,
            defaultMotionProfileRef:
              capabilityDriven.profiles.motion.defaultMotionProfileRef,
            controlProfileRef: capabilityDriven.profiles.controlProfileRef,
            cameraContextProfileRef:
              capabilityDriven.profiles.cameraContextProfileRef,
          };
        }),
    listMotionKernels: (options = {}) =>
      builtInSubjectResourceRegistry.listDiscoverableResources({
        kind: "motion-kernel",
      })
        .filter(
          (resource) =>
            (options.includeExperimental === true ||
              resource.authoringAvailability !== "experimental") &&
            (options.includeInternal === true ||
              resource.authoringAvailability !== "internal"),
        )
        .map((resource) => ({
          resourceRef: resource.resourceRef,
          displayName: resource.aiMetadata.displayName,
          implementationId: resource.implementationId,
          commandKind: resource.commandKind,
          runtimeStatus: resource.runtimeStatus,
          authoringAvailability: resource.authoringAvailability,
        })),
    listCompatibleProfiles: (subjectDefinitionRef) =>
      listSubjectPresetAuthoringProfilesV1(subjectDefinitionRef)
        .map(runtimeProfileDiscoverySummaryV1),
    getSubjectPresetBaseline: (subjectDefinitionRef) => {
      const closure = resolveSubjectPresetClosureV1(
        builtInSubjectResourceRegistry,
        subjectDefinitionRef,
      );
      const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
        subjectDefinitionRef,
      );
      if (definition === undefined || !("schemaVersion" in definition)) {
        throw new Error(`WORLDKIT_SUBJECT_DEFINITION_NOT_FOUND: ${subjectDefinitionRef}`);
      }
      const cameraContext = builtInSubjectResourceRegistry.resolveCameraContextProfile(
        definition.profiles.cameraContextProfileRef,
      );
      if (cameraContext === undefined) {
        throw new Error(
          `WORLDKIT_CAMERA_CONTEXT_NOT_FOUND: ${definition.profiles.cameraContextProfileRef}`,
        );
      }
      const publicDefault = builtInSubjectDefaultRegistry.resolvePublicDefault(
        closure.subjectDefinitionId,
      );
      return Object.freeze({
        closure,
        defaultCameraRigProfileRef: cameraContext.defaultCameraRigProfileRef,
        ...(cameraContext.firstPersonCameraRigProfileRef === undefined
          ? {}
          : { firstPersonCameraRigProfileRef: cameraContext.firstPersonCameraRigProfileRef }),
        ...(publicDefault === undefined ? {} : { publicDefault }),
      });
    },
    validateSubjectPackage: (subjectDefinitionRef) =>
      validateSubjectPackageAgainstRegistry(
        builtInSubjectResourceRegistry,
        subjectDefinitionRef,
      ),
    setIntent: async (input) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      return callAdapterAsync(
        "WORLDKIT_FIXED_INPUT_EXECUTION_FAILED",
        "Fixed Input execution failed.",
        () => adapter.runWorldkitFixedInput([input]),
      );
    },
    adjustCameraView: (input) => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_CAMERA_VIEW_OPERATION_FAILED",
        "Camera View operation failed.",
        () => adapter.adjustCameraViewRuntime(input),
      );
    },
    resetCameraView: () => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_CAMERA_VIEW_OPERATION_FAILED",
        "Camera View operation failed.",
        () => adapter.resetCameraViewRuntime(),
      );
    },
    getCameraPreviewState: () => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_CAMERA_PREVIEW_OPERATION_FAILED",
        "Camera Preview operation failed.",
        () => adapter.getCameraPreviewStateRuntime(),
      );
    },
    applyCameraPreview: (request) => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_CAMERA_PREVIEW_OPERATION_FAILED",
        "Camera Preview operation failed.",
        () => adapter.applyCameraPreviewRuntime(request),
      );
    },
    applySubjectPresetTuning: (request) => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_SUBJECT_PRESET_TUNING_FAILED",
        "Subject Preset tuning failed.",
        () => adapter.applySubjectPresetTuningRuntime(request),
      );
    },
    setMotionProfile: async (subjectEntityId, motionProfileRef) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      return callAdapterAsync(
        "WORLDKIT_MOTION_PROFILE_SWITCH_FAILED",
        "Motion Profile switching failed.",
        () => adapter.setMotionProfileRuntime(subjectEntityId, motionProfileRef),
      );
    },
    runHarness: async (subjectEntityId) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      return callAdapterAsync(
        "WORLDKIT_SUBJECT_HARNESS_FAILED",
        "Subject Harness execution failed.",
        () => adapter.runSubjectHarness(subjectEntityId),
      );
    },
    getSubjectSnapshot: (subjectEntityId) => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_RUNTIME_SNAPSHOT_FAILED",
        "Worldkit runtime snapshot failed.",
        () => adapter.runtimeSnapshot().world
          .subjectStatesByEntityId[subjectEntityId],
      );
    },
    getCameraSnapshot: () => {
      const adapter = requireReadyAdapter();
      return callAdapter(
        "WORLDKIT_RUNTIME_SNAPSHOT_FAILED",
        "Worldkit runtime snapshot failed.",
        () => adapter.runtimeSnapshot().view.camera,
      );
    },
    getRouteSummary: (selector) => {
      const lookup = findRouteEvidence(selector);
      if (lookup.projection === undefined) return unavailableFromLookup(lookup);
      return immutableBrowserCopy({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "available",
        selector: lookup.selector,
        summary: lookup.projection.summary,
      });
    },
    getRoutePathReceipt: (selector) => {
      const lookup = findRouteEvidence(selector);
      const receipt = lookup.projection?.routePathReceipt;
      if (receipt === undefined) return unavailableFromLookup(lookup);
      return immutableBrowserCopy({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "available",
        selector: lookup.selector,
        routePathReceipt: receipt,
      });
    },
    getRouteRuntimeProbeReceipt: (selector) => {
      const lookup = findRouteEvidence(selector);
      const receipt = lookup.projection?.routeRuntimeProbeReceipt;
      if (receipt === undefined) return unavailableFromLookup(lookup);
      return immutableBrowserCopy({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "available",
        selector: lookup.selector,
        routeRuntimeProbeReceipt: receipt,
      });
    },
    getRouteOverlay: (selector) => {
      const lookup = findRouteEvidence(selector);
      const overlay = lookup.projection?.routeOverlay;
      if (overlay === undefined) return unavailableFromLookup(lookup);
      return immutableBrowserCopy({
        kind: "worldkit-route-evidence-query-result",
        schemaVersion: 1,
        availability: "available",
        selector: lookup.selector,
        routeOverlay: overlay,
      });
    },
  };

  options.target.__WORLDKIT__ = api;
  options.statusElement.dataset.worldkitStatus = "loading";

  const disposeTrackedAdapter = async (): Promise<void> => {
    if (trackedAdapter === undefined || adapterDisposed) return;
    adapterDisposed = true;
    await trackedAdapter.disposeRuntime();
  };

  const initialization = Promise.resolve()
    .then(() =>
      options.initialize({
        trackAdapter(adapter) {
          if (trackedAdapter !== undefined && trackedAdapter !== adapter) {
            throw new Error("Multiple Browser Runtime Adapters were created.");
          }
          trackedAdapter = adapter;
        },
      }),
    )
    .then(async (adapter) => {
      if (trackedAdapter !== undefined && trackedAdapter !== adapter) {
        throw new Error("Browser Runtime Adapter ownership changed during startup.");
      }
      trackedAdapter = adapter;
      diagnostics = Object.freeze(
        adapter.runtimeDiagnostics().map((diagnostic) =>
          deepFreeze(structuredClone(diagnostic)),
        ),
      );
      const snapshot = adapter.runtimeSnapshot();
      state = "ready";
      options.statusElement.dataset.worldkitStatus = "ready";
      resolveReady(snapshot);
      return adapter;
    })
    .catch(async (error: unknown) => {
      try {
        await disposeTrackedAdapter();
      } catch {
        // Preserve the primary startup diagnostic after best-effort cleanup.
      }
      if (startupFailureDiagnostics !== undefined) {
        diagnostics = startupFailureDiagnostics;
        const primaryDiagnostic = startupFailureDiagnostics[0];
        if (primaryDiagnostic === undefined) {
          throw new Error("WORLDKIT_STARTUP_FAILURE_DIAGNOSTICS_EMPTY");
        }
        startupError = new WorldkitBrowserStartupErrorV1(
          primaryDiagnostic.code,
          primaryDiagnostic,
        );
      } else {
        startupError = await sanitizeStartupError(error);
        diagnostics = Object.freeze([startupError.diagnostic]);
      }
      state = "error";
      options.statusElement.dataset.worldkitStatus = "error";
      rejectReady(startupError);
      return undefined;
    });

  return {
    api,
    initialization,
    dispose: async () => {
      await initialization;
      await disposeTrackedAdapter();
    },
  };
}



function createRouteEvidenceByKeyV2(
  publication: WorldkitBrowserRouteEvidencePublicationV2 | undefined,
): ReadonlyMap<string, WorldkitBrowserRouteEvidenceProjectionV2> | undefined {
  if (publication === undefined) return undefined;
  const canonical = canonicalWorldkitBrowserRouteEvidencePublicationV2(
    publication,
  );
  const byKey = new Map<string, WorldkitBrowserRouteEvidenceProjectionV2>();
  for (const projection of canonical.routes) {
    byKey.set(routeEvidenceKey(projection.selector), projection);
  }
  return byKey;
}

export function createWorldkitBrowserApiV5(options: Readonly<{
  routeEvidencePublication?: WorldkitBrowserRouteEvidencePublicationV2;
}>): WorldkitBrowserApiV5 {
  const routeEvidenceByKey = createRouteEvidenceByKeyV2(
    options.routeEvidencePublication,
  );

  const findRouteEvidence = (selector: RouteEvidenceSelectorV1) => {
    const canonicalSelector = canonicalRouteEvidenceSelectorV1(selector);
    if (routeEvidenceByKey === undefined) {
      return {
        selector: canonicalSelector,
        projection: undefined as
          | WorldkitBrowserRouteEvidenceProjectionV2
          | undefined,
        reason: "route-evidence-not-loaded" as const,
      };
    }
    const projection = routeEvidenceByKey.get(routeEvidenceKey(canonicalSelector));
    return {
      selector: canonicalSelector,
      projection,
      reason: projection === undefined ? ("route-not-found" as const) : undefined,
    };
  };

  const unavailableFromLookup = (
    lookup: ReturnType<typeof findRouteEvidence>,
  ): RouteEvidenceUnavailableResultV1 => immutableBrowserCopy({
    kind: "worldkit-route-evidence-query-result" as const,
    schemaVersion: 1 as const,
    availability: "unavailable" as const,
    selector: lookup.selector,
    reason: lookup.reason ?? "evidence-not-published",
  });

  const notReady = (): never => {
    throw notReadyError();
  };

  return Object.freeze({
    version: 5,
    ready: notReady,
    getSnapshot: notReady,
    getDiagnostics: notReady,
    executeGameplayCommand: notReady,
    executeCameraViewCommand: notReady,
    runFixedInput: notReady,
    getWorldSessionEvents: notReady,
    getGameplayInspectionSnapshot: notReady,
    getWorldStateSnapshot: notReady,
    acquireRuntimeActivity: notReady,
    releaseRuntimeActivity: notReady,
    getControlCaptureCapabilities: notReady,
    waitForSimulationTick: notReady,
    waitForRenderReady: notReady,
    captureControlFrame: notReady,
    captureScreenshot: notReady,
    reset: notReady,
    setPaused: notReady,
    listSubjectDefinitions: notReady,
    listMotionKernels: notReady,
    listCompatibleProfiles: notReady,
    getSubjectPresetBaseline: notReady,
    validateSubjectPackage: notReady,
    setIntent: notReady,
    adjustCameraView: notReady,
    resetCameraView: notReady,
    getCameraPreviewState: notReady,
    applyCameraPreview: notReady,
    applySubjectPresetTuning: notReady,
    setMotionProfile: notReady,
    runHarness: notReady,
    getSubjectSnapshot: notReady,
    getCameraSnapshot: notReady,
    getRouteSummary: (
      selector: RouteEvidenceSelectorV1,
    ): RouteSummaryQueryResultV1 => {
      const lookup = findRouteEvidence(selector);
      if (lookup.projection === undefined) return unavailableFromLookup(lookup);
      return immutableBrowserCopy({
        kind: "worldkit-route-evidence-query-result" as const,
        schemaVersion: 1 as const,
        availability: "available" as const,
        selector: lookup.selector,
        summary: lookup.projection.summary,
      });
    },
    getRoutePathReceipt: (
      selector: RouteEvidenceSelectorV1,
    ): RoutePathReceiptQueryResultV2 => {
      const lookup = findRouteEvidence(selector);
      const receipt = lookup.projection?.routePathReceipt;
      if (receipt === undefined) return unavailableFromLookup(lookup);
      return immutableBrowserCopy({
        kind: "worldkit-route-evidence-query-result" as const,
        schemaVersion: 1 as const,
        availability: "available" as const,
        selector: lookup.selector,
        routePathReceipt: receipt,
      });
    },
    getRouteRuntimeProbeReceipt: (
      selector: RouteEvidenceSelectorV1,
    ): RouteRuntimeProbeReceiptQueryResultV2 => {
      const lookup = findRouteEvidence(selector);
      const receipt = lookup.projection?.routeRuntimeProbeReceipt;
      if (receipt === undefined) return unavailableFromLookup(lookup);
      return immutableBrowserCopy({
        kind: "worldkit-route-evidence-query-result" as const,
        schemaVersion: 1 as const,
        availability: "available" as const,
        selector: lookup.selector,
        routeRuntimeProbeReceipt: receipt,
      });
    },
    getRouteOverlay: (
      selector: RouteEvidenceSelectorV1,
    ): RouteOverlayQueryResultV2 => {
      const lookup = findRouteEvidence(selector);
      const overlay = lookup.projection?.routeOverlay;
      if (overlay === undefined) return unavailableFromLookup(lookup);
      return immutableBrowserCopy({
        kind: "worldkit-route-evidence-query-result" as const,
        schemaVersion: 1 as const,
        availability: "available" as const,
        selector: lookup.selector,
        routeOverlay: overlay,
      });
    },
  });
}
