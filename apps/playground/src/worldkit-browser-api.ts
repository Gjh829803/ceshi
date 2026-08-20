import type { SubjectAssetRuntimeErrorCodeV1 } from "@whitebox-world/runtime-babylon";
import {
  builtInSubjectResourceRegistry,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";
import {
  WORLDKIT_BROWSER_PROTOCOL_VERSION,
  type BindControlRequestV2,
  type CameraTuningV1,
  type CameraViewInputV1,
  type ControlBindingReceiptV2,
  type FixedInputV1,
  type MotionParameterTuningV1,
  type WorldRuntimeSnapshotV3,
  type SubjectHarnessReportV1,
  type WorldkitBrowserApiV3,
  type WorldkitBrowserDiagnosticV1,
} from "@whitebox-world/runtime-contracts";

export interface DeferredWorldkitBrowserRuntimeAdapterV1 {
  runtimeDiagnostics(): readonly WorldkitBrowserDiagnosticV1[];
  runtimeSnapshot(): WorldRuntimeSnapshotV3;
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runWorldkitFixedInput(
    steps: readonly FixedInputV1[],
  ): Promise<WorldRuntimeSnapshotV3>;
  captureScreenshot(): string;
  resetRuntime(): WorldRuntimeSnapshotV3;
  setPaused(paused: boolean): void;
  disposeRuntime(): Promise<void>;
  setCameraPreferenceRuntime?(preference: string): WorldRuntimeSnapshotV3;
  adjustCameraViewRuntime?(input: CameraViewInputV1): WorldRuntimeSnapshotV3;
  resetCameraViewRuntime?(): WorldRuntimeSnapshotV3;
  setCameraTuningRuntime?(tuning: CameraTuningV1): WorldRuntimeSnapshotV3;
  setMotionTuningRuntime?(
    subjectEntityId: string,
    tuning: MotionParameterTuningV1,
  ): WorldRuntimeSnapshotV3;
  runSubjectHarness?(subjectEntityId: string): Promise<SubjectHarnessReportV1>;
  setMotionProfileRuntime?(
    subjectEntityId: string,
    motionProfileRef: string,
  ): Promise<WorldRuntimeSnapshotV3>;
}

interface WorldkitBrowserApiTargetV1 {
  __WORLDKIT__?: WorldkitBrowserApiV3;
}

interface WorldkitBrowserStatusTargetV1 {
  dataset: { worldkitStatus?: string };
}

export interface DeferredWorldkitBrowserInitializationContextV1 {
  trackAdapter(adapter: DeferredWorldkitBrowserRuntimeAdapterV1): void;
}

export interface DeferredWorldkitBrowserApiInstallationV1 {
  readonly api: WorldkitBrowserApiV3;
  readonly initialization: Promise<
    DeferredWorldkitBrowserRuntimeAdapterV1 | undefined
  >;
  dispose(): Promise<void>;
}

type BrowserStartupErrorCodeV1 =
  | SubjectAssetRuntimeErrorCodeV1
  | "WORLDKIT_LAYOUT_ASSERTION_FAILED"
  | "WORLDKIT_RUNTIME_INITIALIZATION_FAILED"
  | "WORLDKIT_RUNTIME_NOT_READY";

class WorldkitBrowserStartupErrorV1 extends Error {
  readonly name = "WorldkitBrowserStartupErrorV1";

  constructor(
    readonly code: BrowserStartupErrorCodeV1,
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
      ...(cameraContext.firstPersonCameraRigProfileRef === undefined
        ? []
        : [cameraContext.firstPersonCameraRigProfileRef]),
      ...cameraContext.rules.map((rule) => rule.cameraRigProfileRef),
    ])].sort((left, right) => left.localeCompare(right));
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

export function installDeferredWorldkitBrowserApi(options: {
  target: WorldkitBrowserApiTargetV1;
  statusElement: WorldkitBrowserStatusTargetV1;
  initialize(
    context: DeferredWorldkitBrowserInitializationContextV1,
  ): Promise<DeferredWorldkitBrowserRuntimeAdapterV1>;
}): DeferredWorldkitBrowserApiInstallationV1 {
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

  const api: WorldkitBrowserApiV3 = {
    version: WORLDKIT_BROWSER_PROTOCOL_VERSION,
    ready: () => startupPromise,
    getSnapshot: () => requireReadyAdapter().runtimeSnapshot(),
    getDiagnostics: () => diagnostics,
    bindControl: (request) => requireReadyAdapter().bindControl(request),
    runFixedInput: async (steps) => {
      await startupPromise;
      return requireReadyAdapter().runWorldkitFixedInput(steps);
    },
    captureScreenshot: () => requireReadyAdapter().captureScreenshot(),
    reset: () => requireReadyAdapter().resetRuntime(),
    setPaused: (paused) => {
      const adapter = requireReadyAdapter();
      adapter.setPaused(paused);
      return adapter.runtimeSnapshot();
    },
    listSubjectDefinitions: (options = {}) =>
      builtInSubjectResourceRegistry.listCapabilitySubjectDefinitions()
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
    listCompatibleProfiles: (subjectDefinitionRef) => {
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
        cameraContext.rules.forEach((rule) => cameraRefs.add(rule.cameraRigProfileRef));
      }
      return [
        ...[...motionRefs].flatMap((resourceRef) => {
          const resource = builtInSubjectResourceRegistry.resolveMotionProfile(resourceRef);
          return resource === undefined
            ? []
            : [{
                resourceRef,
                kind: "motion-profile" as const,
                displayName: resource.aiMetadata.displayName,
                role: resourceRef === definition.profiles.motion.defaultMotionProfileRef
                  ? "default" as const
                  : resourceRef === definition.profiles.motion.fallbackMotionProfileRef
                    ? "fallback" as const
                    : "optional" as const,
                parameters: resource.parameters,
                safetyLimits: resource.safetyLimits,
              }];
        }),
        ...[...cameraRefs].flatMap((resourceRef) => {
          const resource = builtInSubjectResourceRegistry.resolveCameraRigProfile(resourceRef);
          return resource === undefined
            ? []
            : [{
                resourceRef,
                kind: "camera-rig-profile" as const,
                displayName: resource.aiMetadata.displayName,
                role: "camera" as const,
                parameters: resource.parameters,
              }];
        }),
      ].sort((left, right) => left.resourceRef.localeCompare(right.resourceRef));
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
    setMotionTuning: (subjectEntityId, tuning) => {
      const adapter = requireReadyAdapter();
      if (adapter.setMotionTuningRuntime === undefined) {
        throw new Error("WORLDKIT_MOTION_TUNING_UNAVAILABLE");
      }
      return adapter.setMotionTuningRuntime(subjectEntityId, tuning);
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
  };

  // Protocol V3 keys remain enumerable for exact backward compatibility. The
  // capability-authoring extension is callable but does not mutate that key set.
  for (const extensionName of [
    "adjustCameraView",
    "getCameraSnapshot",
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
    "setMotionTuning",
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
      startupError = await sanitizeStartupError(error);
      diagnostics = Object.freeze([startupError.diagnostic]);
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
