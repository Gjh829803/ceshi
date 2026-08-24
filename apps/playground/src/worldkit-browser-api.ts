import type { SubjectAssetRuntimeErrorCodeV1 } from "@whitebox-world/runtime-babylon";
import {
  builtInSubjectDefaultRegistry,
  builtInSubjectResourceRegistry,
  resolveSubjectPresetClosureV1,
  selectableControlFeelProfileRefsV1,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";
import {
  CONTROL_FEEL_PARAMETER_BOUNDS_V1,
  CONTROL_FEEL_PARAMETER_NAMES_V1,
  WORLDKIT_BROWSER_PROTOCOL_VERSION,
  canonicalWorldkitBrowserRouteEvidencePublicationV2,
  canonicalRouteEvidenceSelectorV1,
  type ApplySubjectPresetTuningRequestV1,
  type BindControlRequestV2,
  type CameraTuningV1,
  type CameraViewInputV1,
  type CompatibleProfileSummaryV1,
  type ControlCaptureCapabilitiesV1,
  type ControlCaptureRequestV1,
  type ControlBindingReceiptV2,
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
  type WorldRuntimeSnapshotV3,
  type SubjectHarnessReportV1,
  type SubjectPresetTuningReceiptV1,
  type WorldkitBrowserApiV5,
  type WorldkitBrowserDiagnosticV1,
} from "@whitebox-world/runtime-contracts";

export interface DeferredWorldkitBrowserRuntimeAdapterV1 {
  runtimeDiagnostics(): readonly WorldkitBrowserDiagnosticV1[];
  runtimeSnapshot(): WorldRuntimeSnapshotV3;
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runWorldkitFixedInput(
    steps: readonly FixedInputV1[],
  ): Promise<WorldRuntimeSnapshotV3>;
  getControlCaptureCapabilities(): ControlCaptureCapabilitiesV1;
  waitForSimulationTick(expectedSimulationTick: number): Promise<WorldRuntimeSnapshotV3>;
  waitForRenderReady(expectedSimulationTick: number): Promise<RenderReadyReceiptV1>;
  captureControlFrame(request: ControlCaptureRequestV1): Promise<RuntimeControlCaptureFrameV1>;
  captureScreenshot(): string;
  resetRuntime(): WorldRuntimeSnapshotV3;
  setPaused(paused: boolean): void;
  disposeRuntime(): Promise<void>;
  setCameraPreferenceRuntime?(preference: string): WorldRuntimeSnapshotV3;
  adjustCameraViewRuntime?(input: CameraViewInputV1): WorldRuntimeSnapshotV3;
  resetCameraViewRuntime?(): WorldRuntimeSnapshotV3;
  setCameraTuningRuntime?(tuning: CameraTuningV1): WorldRuntimeSnapshotV3;
  applySubjectPresetTuningRuntime?(
    request: ApplySubjectPresetTuningRequestV1,
  ): SubjectPresetTuningReceiptV1;
  runSubjectHarness?(subjectEntityId: string): Promise<SubjectHarnessReportV1>;
  setMotionProfileRuntime?(
    subjectEntityId: string,
    motionProfileRef: string,
  ): Promise<WorldRuntimeSnapshotV3>;
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
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
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
    "worldkit://capability/relationship.mount@1":
      "worldkit://relationship-profile/mount.reserved@1",
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
  let startupError: WorldkitBrowserStartupErrorV1 | undefined;
  let diagnostics: readonly WorldkitBrowserDiagnosticV1[] = Object.freeze([]);
  let resolveReady!: (snapshot: WorldRuntimeSnapshotV3) => void;
  let rejectReady!: (error: WorldkitBrowserStartupErrorV1) => void;
  const startupPromise = new Promise<WorldRuntimeSnapshotV3>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void startupPromise.catch(() => undefined);

  const requireReadyAdapter = (): DeferredWorldkitBrowserRuntimeAdapterV1 => {
    if (state === "loading") throw notReadyError();
    if (state === "error") throw startupError;
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
    getSnapshot: () => requireReadyAdapter().runtimeSnapshot(),
    getDiagnostics: () => diagnostics,
    bindControl: (request) => requireReadyAdapter().bindControl(request),
    runFixedInput: async (steps) => {
      await startupPromise;
      return requireReadyAdapter().runWorldkitFixedInput(steps);
    },
    getControlCaptureCapabilities: () =>
      requireReadyAdapter().getControlCaptureCapabilities(),
    waitForSimulationTick: async (expectedSimulationTick) => {
      await startupPromise;
      return requireReadyAdapter().waitForSimulationTick(expectedSimulationTick);
    },
    waitForRenderReady: async (expectedSimulationTick) => {
      await startupPromise;
      return requireReadyAdapter().waitForRenderReady(expectedSimulationTick);
    },
    captureControlFrame: async (request) => {
      await startupPromise;
      return requireReadyAdapter().captureControlFrame(request);
    },
    captureScreenshot: () => requireReadyAdapter().captureScreenshot(),
    reset: () => requireReadyAdapter().resetRuntime(),
    setPaused: (paused) => {
      const adapter = requireReadyAdapter();
      adapter.setPaused(paused);
      return adapter.runtimeSnapshot();
    },
    listSubjectDefinitions: (options = {}) =>
      builtInSubjectDefaultRegistry.listPublicDefaults()
        .flatMap((entry) => {
          const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
            entry.subjectDefinitionRef,
          );
          return definition !== undefined && "schemaVersion" in definition
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
      builtInSubjectResourceRegistry.listCapabilityResources()
        .filter((resource) => resource.kind === "motion-kernel")
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
      return requireReadyAdapter().runWorldkitFixedInput([input]);
    },
    setCameraPreference: (preference) => {
      const adapter = requireReadyAdapter();
      if (adapter.setCameraPreferenceRuntime === undefined) {
        throw new Error("WORLDKIT_CAMERA_PREFERENCE_UNAVAILABLE");
      }
      return adapter.setCameraPreferenceRuntime(preference);
    },
    adjustCameraView: (input) => {
      const adapter = requireReadyAdapter();
      if (adapter.adjustCameraViewRuntime === undefined) {
        throw new Error("WORLDKIT_CAMERA_VIEW_INPUT_UNAVAILABLE");
      }
      return adapter.adjustCameraViewRuntime(input);
    },
    resetCameraView: () => {
      const adapter = requireReadyAdapter();
      if (adapter.resetCameraViewRuntime === undefined) {
        throw new Error("WORLDKIT_CAMERA_VIEW_RESET_UNAVAILABLE");
      }
      return adapter.resetCameraViewRuntime();
    },
    setCameraTuning: (tuning) => {
      const adapter = requireReadyAdapter();
      if (adapter.setCameraTuningRuntime === undefined) {
        throw new Error("WORLDKIT_CAMERA_TUNING_UNAVAILABLE");
      }
      return adapter.setCameraTuningRuntime(tuning);
    },
    applySubjectPresetTuning: (request) => {
      const adapter = requireReadyAdapter();
      if (adapter.applySubjectPresetTuningRuntime === undefined) {
        throw new Error("WORLDKIT_SUBJECT_PRESET_TUNING_UNAVAILABLE");
      }
      return adapter.applySubjectPresetTuningRuntime(request);
    },
    setMotionProfile: async (subjectEntityId, motionProfileRef) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      if (adapter.setMotionProfileRuntime === undefined) {
        throw new Error("WORLDKIT_MOTION_PROFILE_SWITCH_UNAVAILABLE");
      }
      return adapter.setMotionProfileRuntime(subjectEntityId, motionProfileRef);
    },
    runHarness: async (subjectEntityId) => {
      await startupPromise;
      const adapter = requireReadyAdapter();
      if (adapter.runSubjectHarness === undefined) {
        throw new Error("WORLDKIT_SUBJECT_HARNESS_UNAVAILABLE");
      }
      return adapter.runSubjectHarness(subjectEntityId);
    },
    getSubjectSnapshot: (subjectEntityId) =>
      requireReadyAdapter().runtimeSnapshot().subjectStatesByEntityId[subjectEntityId],
    getCameraSnapshot: () => requireReadyAdapter().runtimeSnapshot().camera,
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

  // The original protocol method keys remain enumerable for exact behavior
  // compatibility. Capability and Route Evidence extensions are callable but
  // do not mutate that key set.
  for (const extensionName of [
    "adjustCameraView",
    "applySubjectPresetTuning",
    "getCameraSnapshot",
    "getRouteOverlay",
    "getRoutePathReceipt",
    "getRouteRuntimeProbeReceipt",
    "getRouteSummary",
    "getSubjectPresetBaseline",
    "getSubjectSnapshot",
    "listCompatibleProfiles",
    "listMotionKernels",
    "listSubjectDefinitions",
    "runHarness",
    "resetCameraView",
    "setCameraPreference",
    "setCameraTuning",
    "setIntent",
    "setMotionProfile",
    "validateSubjectPackage",
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(api, extensionName);
    if (descriptor !== undefined) {
      Object.defineProperty(api, extensionName, { ...descriptor, enumerable: false });
    }
  }

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
    bindControl: notReady,
    runFixedInput: notReady,
    getControlCaptureCapabilities: notReady,
    waitForSimulationTick: notReady,
    waitForRenderReady: notReady,
    captureControlFrame: notReady,
    captureScreenshot: notReady,
    reset: notReady,
    setPaused: notReady,
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
