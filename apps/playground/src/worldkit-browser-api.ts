import type { SubjectAssetRuntimeErrorCodeV1 } from "@whitebox-world/runtime-babylon";
import {
  WORLDKIT_BROWSER_PROTOCOL_VERSION,
  type BindControlRequestV2,
  type ControlBindingReceiptV2,
  type FixedInputV1,
  type WorldRuntimeSnapshotV3,
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
