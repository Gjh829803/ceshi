import type { SubjectAssetRuntimeErrorCodeV1 } from "@whitebox-world/runtime-babylon";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import {
  WORLDKIT_BROWSER_PROTOCOL_VERSION,
  type BindControlRequestV2,
  type CameraTuningV1,
  type CameraViewInputV1,
  type ControlBindingReceiptV2,
  type FixedInputV1,
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
    listSubjectDefinitions: () =>
      builtInSubjectResourceRegistry.listAllSubjectDefinitions()
        .filter((definition) => "schemaVersion" in definition)
        .map((definition) => {
          const capabilityDriven = definition as Extract<
            ReturnType<typeof builtInSubjectResourceRegistry.listAllSubjectDefinitions>[number],
            { schemaVersion: 3 }
          >;
          return {
            resourceRef: capabilityDriven.resourceRef,
            displayName: capabilityDriven.aiMetadata.displayName,
            semanticClassId: capabilityDriven.semanticClassId,
            bodyTopology: capabilityDriven.bodyTopology,
            agentAccessLevel: capabilityDriven.agentAccessLevel,
            defaultMotionProfileRef:
              capabilityDriven.profiles.motion.defaultMotionProfileRef,
            controlProfileRef: capabilityDriven.profiles.controlProfileRef,
            cameraContextProfileRef:
              capabilityDriven.profiles.cameraContextProfileRef,
          };
        }),
    listMotionKernels: () =>
      builtInSubjectResourceRegistry.listAllResources()
        .filter((resource) => resource.kind === "motion-kernel")
        .map((resource) => ({
          resourceRef: resource.resourceRef,
          displayName: resource.aiMetadata.displayName,
          implementationId: resource.implementationId,
          commandKind: resource.commandKind,
          runtimeStatus: resource.runtimeStatus,
          agentAccessLevel: resource.agentAccessLevel,
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
    validateSubjectPackage: (subjectDefinitionRef) => {
      const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
        subjectDefinitionRef,
      );
      const diagnostics: { code: string; message: string }[] = [];
      if (definition === undefined || !("schemaVersion" in definition)) {
        diagnostics.push({
          code: "SUBJECT_PACKAGE_NOT_FOUND",
          message: "The exact capability-driven Subject Definition is not registered.",
        });
      } else {
        const motion = builtInSubjectResourceRegistry.resolveMotionProfile(
          definition.profiles.motion.defaultMotionProfileRef,
        );
        const kernel = motion === undefined
          ? undefined
          : builtInSubjectResourceRegistry.resolveMotionKernel(motion.motionKernelRef);
        const control = builtInSubjectResourceRegistry.resolveControlProfile(
          definition.profiles.controlProfileRef,
        );
        if (kernel?.runtimeStatus !== "implemented") {
          diagnostics.push({
            code: "SUBJECT_KERNEL_NOT_IMPLEMENTED",
            message: "The selected Motion Kernel is not installed in the canonical runtime.",
          });
        }
        if (kernel !== undefined && control !== undefined && kernel.commandKind !== control.commandKind) {
          diagnostics.push({
            code: "SUBJECT_COMMAND_KIND_MISMATCH",
            message: "Control Profile and Motion Kernel command kinds do not match.",
          });
        }
      }
      return { valid: diagnostics.length === 0, subjectDefinitionRef, diagnostics };
    },
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
