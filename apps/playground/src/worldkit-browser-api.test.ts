import { describe, expect, it } from "vitest";

import {
  SubjectAssetRuntimeErrorV1,
  WorldRuntimeLayoutAssertionErrorV1,
} from "@whitebox-world/runtime-babylon";
import type {
  BindControlRequestV2,
  ControlCapturePassPayloadV1,
  ControlBindingReceiptV2,
  FixedInputV1,
  RuntimeControlCaptureFrameV1,
  WorldRuntimeSnapshotV3,
  WorldkitBrowserApiV3,
  WorldkitBrowserDiagnosticV1,
} from "@whitebox-world/runtime-contracts";
import {
  builtInSubjectResourceRegistry,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";

import {
  installDeferredWorldkitBrowserApi,
  validateSubjectPackageAgainstRegistry,
  type DeferredWorldkitBrowserRuntimeAdapterV1,
} from "./worldkit-browser-api";

function snapshotFixture(action: "idle" | "walk" | "run" | "jump" = "idle"): WorldRuntimeSnapshotV3 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 3,
    runtimeBackend: "babylon-havok",
    tick: 0,
    ready: true,
    controlledEntityId: "rigged-primary",
    controllersById: {
      "controller-primary": {
        id: "controller-primary",
        controlledEntityId: "rigged-primary",
      },
    },
    subjectStatesByEntityId: {
      "rigged-primary": {
        entityId: "rigged-primary",
        subjectDefinitionRef: "worldkit://subject-definition/humanoid.rigged-golden@1",
        subjectDefinitionHash: `sha256:${"1".repeat(64)}`,
        positionMetersXYZ: [0, 0, 0],
        velocityMetersPerSecondXYZ: [0, 0, 0],
        movementMedium: "ground",
        activeActionId: action,
      },
    },
    camera: {
      entityId: "camera-main",
      targetEntityId: "rigged-primary",
      positionMetersXYZ: [0, 4, 6],
    },
    physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
    resources: { meshes: 1, bodies: 1, terrainSamples: 9 },
  };
}

function adapterFixture(
  runtimeDiagnostics: readonly WorldkitBrowserDiagnosticV1[] = [],
): DeferredWorldkitBrowserRuntimeAdapterV1 & {
  disposeCount: number;
} {
  const snapshot = snapshotFixture();
  const pass = (
    passId: ControlCapturePassPayloadV1["passId"],
    mediaType: ControlCapturePassPayloadV1["mediaType"],
    encoding: ControlCapturePassPayloadV1["encoding"],
  ): ControlCapturePassPayloadV1 => ({
    passId,
    mediaType,
    encoding,
    byteLength: 0,
    contentHash: `sha256:${"0".repeat(64)}`,
    bytesBase64: "",
  });
  const captureFrame: RuntimeControlCaptureFrameV1 = {
    kind: "worldkit-control-capture-frame",
    schemaVersion: 1,
    runtimeSessionId: "runtime-session-test",
    captureFrameIndex: 0,
    simulationTick: 0,
    renderFrameIndex: 0,
    renderReadyReceiptId: "render-ready:test:0",
    widthPixels: 16,
    heightPixels: 9,
    camera: {
      cameraEntityId: "camera-main",
      cameraRigRef: "worldkit://camera/third-person.standard@1",
      positionMetersXYZ: [0, 4, 6],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      verticalFovRadians: 1,
      nearClipMeters: 0.05,
      farClipMeters: 1_000,
      viewMatrixColumnMajor: Array.from({ length: 16 }, (_, index) => index),
      projectionMatrixColumnMajor: Array.from({ length: 16 }, (_, index) => index),
    },
    snapshot,
    semanticClasses: [],
    instances: [],
    passesById: {
      "neutral-color": pass("neutral-color", "image/png", "png-rgba8-srgb"),
      "linear-depth-meters": pass("linear-depth-meters", "application/octet-stream", "float32-le"),
      "semantic-class-id": pass("semantic-class-id", "application/octet-stream", "uint32-le"),
      "instance-id": pass("instance-id", "application/octet-stream", "uint32-le"),
      "world-normal": pass("world-normal", "application/octet-stream", "float32x3-le"),
    },
  };
  return {
    disposeCount: 0,
    runtimeDiagnostics: () => runtimeDiagnostics,
    runtimeSnapshot: () => snapshot,
    bindControl: (request: BindControlRequestV2): ControlBindingReceiptV2 => ({
      kind: "worldkit-control-binding-receipt",
      schemaVersion: 2,
      status: "committed",
      controllerId: request.controllerId,
      previousControlledEntityId: request.expectedControlledEntityId,
      controlledEntityId: request.controlledEntityId,
    }),
    runWorldkitFixedInput: async (_steps: readonly FixedInputV1[]) => snapshotFixture("run"),
    getControlCaptureCapabilities: () => ({
      kind: "worldkit-control-capture-capabilities",
      schemaVersion: 1,
      available: true,
      captureProfileRef: "worldkit://capture/profile/control-video@1",
      captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1",
      requiredPassIds: [
        "neutral-color",
        "linear-depth-meters",
        "semantic-class-id",
        "instance-id",
        "world-normal",
      ],
      maximumWidthPixels: 4_096,
      maximumHeightPixels: 4_096,
      diagnostics: [],
    }),
    waitForSimulationTick: async () => snapshot,
    waitForRenderReady: async () => ({
      kind: "worldkit-render-ready-receipt",
      schemaVersion: 1,
      id: "render-ready:test:0",
      runtimeSessionId: "runtime-session-test",
      simulationTick: 0,
      renderFrameIndex: 0,
    }),
    captureControlFrame: async () => captureFrame,
    captureScreenshot: () => "data:image/png;base64,",
    resetRuntime: () => snapshot,
    setPaused: () => undefined,
    disposeRuntime: async function () {
      this.disposeCount += 1;
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("installDeferredWorldkitBrowserApi", () => {
  it("installs before startup, keeps one ready Promise, and gates sync/async methods", async () => {
    const gate = deferred<void>();
    const adapter = adapterFixture();
    const target: { __WORLDKIT__?: WorldkitBrowserApiV3 } = {};
    const statusElement = { dataset: {} as Record<string, string | undefined> };
    const installation = installDeferredWorldkitBrowserApi({
      target,
      statusElement,
      initialize: async ({ trackAdapter }) => {
        await gate.promise;
        trackAdapter(adapter);
        return adapter;
      },
    });
    const api = target.__WORLDKIT__ as typeof installation.api;

    expect(api).toBe(installation.api);
    expect(statusElement.dataset.worldkitStatus).toBe("loading");
    expect(api.getDiagnostics()).toEqual([]);
    expect(api.ready()).toBe(api.ready());
    expect(() => api.getSnapshot()).toThrowError(
      expect.objectContaining({ code: "WORLDKIT_RUNTIME_NOT_READY" }),
    );
    const pendingRun = api.runFixedInput([{ actions: ["run"], ticks: 1 }]);

    gate.resolve();
    await expect(installation.initialization).resolves.toBe(adapter);
    await expect(api.ready()).resolves.toEqual(snapshotFixture());
    await expect(pendingRun).resolves.toEqual(snapshotFixture("run"));
    expect(api.getControlCaptureCapabilities().available).toBe(true);
    await expect(api.waitForSimulationTick(0)).resolves.toMatchObject({ tick: 0 });
    const receipt = await api.waitForRenderReady(0);
    expect(receipt).toMatchObject({ simulationTick: 0, renderFrameIndex: 0 });
    await expect(api.captureControlFrame({
      captureFrameIndex: 0,
      expectedSimulationTick: 0,
      renderReadyReceiptId: receipt.id,
      widthPixels: 16,
      heightPixels: 9,
    })).resolves.toMatchObject({
      captureFrameIndex: 0,
      simulationTick: 0,
      widthPixels: 16,
      heightPixels: 9,
    });
    expect(statusElement.dataset.worldkitStatus).toBe("ready");
  });

  it("keeps experimental packages out of default AI discovery and uses descriptive availability", async () => {
    const adapter = adapterFixture();
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async ({ trackAdapter }) => {
        trackAdapter(adapter);
        return adapter;
      },
    });
    await installation.initialization;

    const productionDefinitions = installation.api.listSubjectDefinitions?.() ?? [];
    const allDefinitions = installation.api.listSubjectDefinitions?.({
      includeExperimental: true,
    }) ?? [];
    expect(productionDefinitions.map((definition) => definition.resourceRef)).toEqual([
      "worldkit://subject-definition/animal.quadruped.forward-steer@1",
      "worldkit://subject-definition/humanoid.g-bot@1",
    ]);
    const gBotSummary = productionDefinitions.find(
      (definition) =>
        definition.resourceRef ===
        "worldkit://subject-definition/humanoid.g-bot@1",
    );
    expect(gBotSummary?.contentHash).toBe(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        "worldkit://subject-definition/humanoid.g-bot@1",
      )?.contentHash,
    );
    expect(gBotSummary?.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(allDefinitions).toHaveLength(6);
    expect(
      allDefinitions.filter(
        (definition) => definition.authoringAvailability === "experimental",
      ),
    ).toHaveLength(4);
    expect(JSON.stringify(allDefinitions)).not.toMatch(/agentAccessLevel|"T[0-2]"/);

    const productionKernels = installation.api.listMotionKernels?.() ?? [];
    const allKernels = installation.api.listMotionKernels?.({
      includeExperimental: true,
      includeInternal: true,
    }) ?? [];
    expect(
      productionKernels.every(
        (kernel) =>
          kernel.authoringAvailability !== "experimental" &&
          kernel.authoringAvailability !== "internal",
      ),
    ).toBe(true);
    expect(allKernels).toHaveLength(10);
  });

  it.each([
    [
      "worldkit://subject-definition/animal.quadruped.forward-steer@1",
      "mount",
    ],
    [
      "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
      "seat",
    ],
    [
      "worldkit://subject-definition/glider.paraglider.unpowered@1",
      "tether",
    ],
  ])("rejects %s when its %s relationship runtime is unavailable", async (
    subjectDefinitionRef,
  ) => {
    const adapter = adapterFixture();
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async ({ trackAdapter }) => {
        trackAdapter(adapter);
        return adapter;
      },
    });
    await installation.initialization;

    expect(installation.api.validateSubjectPackage?.(subjectDefinitionRef)).toMatchObject({
      valid: false,
      diagnostics: [{ code: "SUBJECT_RELATIONSHIP_NOT_IMPLEMENTED" }],
    });
  });

  it("keeps the canonical G Bot package valid", async () => {
    const adapter = adapterFixture();
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async ({ trackAdapter }) => {
        trackAdapter(adapter);
        return adapter;
      },
    });
    await installation.initialization;

    expect(installation.api.validateSubjectPackage?.(
      "worldkit://subject-definition/humanoid.g-bot@1",
    )).toEqual({
      valid: true,
      subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@1",
      diagnostics: [],
    });
  });

  it("rejects a package when an otherwise resolvable Motion Kernel is reserved", () => {
    const registry: SubjectResourceRegistryV3 = {
      ...builtInSubjectResourceRegistry,
      resolveMotionKernel(resourceRef) {
        const kernel = builtInSubjectResourceRegistry.resolveMotionKernel(resourceRef);
        return kernel === undefined ? undefined : {
          ...kernel,
          runtimeStatus: "reserved",
        };
      },
    };

    expect(validateSubjectPackageAgainstRegistry(
      registry,
      "worldkit://subject-definition/humanoid.g-bot@1",
    )).toMatchObject({
      valid: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "SUBJECT_KERNEL_NOT_IMPLEMENTED" }),
      ]),
    });
  });

  it("publishes stable read-only runtime layout evidence without exposing solver handles", async () => {
    const runtimeDiagnostics: readonly WorldkitBrowserDiagnosticV1[] = [
      {
        severity: "info",
        code: "WORLDKIT_LAYOUT_ASSERTION_SATISFIED",
        instancePath: "/layout/layoutAssertions/0",
        message: "Frozen layout assertion passed runtime validation.",
        details: {
          layoutSolveReportHash: `sha256:${"a".repeat(64)}`,
          constraintId: "spawn-supported",
          kind: "supported-by",
          evidenceEntityIds: ["spawn-main", "terrain-main"],
          measurements: { supportGapMeters: 0, supportRatio: 1 },
          tolerances: { maximumSupportGapMeters: 0.05, minimumSupportRatio: 1 },
        },
      },
    ];
    const adapter = adapterFixture(runtimeDiagnostics);
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async ({ trackAdapter }) => {
        trackAdapter(adapter);
        return adapter;
      },
    });

    await expect(installation.initialization).resolves.toBe(adapter);
    const diagnostics = installation.api.getDiagnostics();
    expect(diagnostics).toEqual(runtimeDiagnostics);
    expect(installation.api.getDiagnostics()).toBe(diagnostics);
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics[0])).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.details)).toBe(true);
    expect(Object.isFrozen(diagnostics[0]?.details?.measurements)).toBe(true);
    expect(Object.keys(installation.api).sort()).toEqual([
      "bindControl",
      "captureControlFrame",
      "captureScreenshot",
      "getControlCaptureCapabilities",
      "getDiagnostics",
      "getSnapshot",
      "ready",
      "reset",
      "runFixedInput",
      "setPaused",
      "version",
      "waitForRenderReady",
      "waitForSimulationTick",
    ]);
    expect(JSON.stringify(installation.api)).not.toMatch(/solve|search|repair|mutate/i);
  });

  it("forwards only guarded Subject Asset codes and publishes one stable diagnostic", async () => {
    const target: { __WORLDKIT__?: WorldkitBrowserApiV3 } = {};
    const statusElement = { dataset: {} as Record<string, string | undefined> };
    const installation = installDeferredWorldkitBrowserApi({
      target,
      statusElement,
      initialize: async () => {
        throw new SubjectAssetRuntimeErrorV1("SUBJECT_ASSET_HASH_MISMATCH", {
          subjectAssetRef: "worldkit://subject-asset/humanoid.golden@1",
          artifactContentHash: `sha256:${"1".repeat(64)}`,
        });
      },
    });

    await expect(installation.initialization).resolves.toBeUndefined();
    const readyError = await installation.api.ready().catch((error: unknown) => error) as {
      code: string;
      diagnostic: unknown;
    };
    expect(readyError).toMatchObject({
      code: "SUBJECT_ASSET_HASH_MISMATCH",
    });
    expect(statusElement.dataset.worldkitStatus).toBe("error");
    const diagnostics = installation.api.getDiagnostics();
    expect(diagnostics).toEqual([
      {
        severity: "error",
        code: "SUBJECT_ASSET_HASH_MISMATCH",
        instancePath: "",
        message: "Subject Asset runtime initialization failed.",
      },
    ]);
    expect(installation.api.getDiagnostics()).toBe(diagnostics);
    expect(readyError.diagnostic).toBe(diagnostics[0]);
  });

  it("forwards only the guarded layout assertion failure without internal details", async () => {
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => {
        throw new WorldRuntimeLayoutAssertionErrorV1();
      },
    });

    await expect(installation.initialization).resolves.toBeUndefined();
    await expect(installation.api.ready()).rejects.toMatchObject({
      code: "WORLDKIT_LAYOUT_ASSERTION_FAILED",
    });
    expect(installation.api.getDiagnostics()).toEqual([
      {
        severity: "error",
        code: "WORLDKIT_LAYOUT_ASSERTION_FAILED",
        instancePath: "",
        message: "Worldkit layout assertion validation failed.",
      },
    ]);
    expect(JSON.stringify(installation.api.getDiagnostics())).not.toContain(
      "frozen layout assertion",
    );
  });

  it("redacts unknown failures even when they imitate a Runtime code", async () => {
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async () => {
        throw Object.assign(new Error("provider secret"), {
          code: "SUBJECT_ASSET_HASH_MISMATCH",
          cause: new Error("private cause"),
        });
      },
    });

    await installation.initialization;
    await expect(installation.api.ready()).rejects.toMatchObject({
      code: "WORLDKIT_RUNTIME_INITIALIZATION_FAILED",
    });
    const diagnosticsJson = JSON.stringify(installation.api.getDiagnostics());
    expect(installation.api.getDiagnostics()).toEqual([
      {
        severity: "error",
        code: "WORLDKIT_RUNTIME_INITIALIZATION_FAILED",
        instancePath: "",
        message: "Worldkit runtime initialization failed.",
      },
    ]);
    expect(diagnosticsJson).not.toContain("provider secret");
    expect(diagnosticsJson).not.toContain("private cause");
  });

  it("cleans a tracked Adapter when startup fails after Runtime creation", async () => {
    const adapter = adapterFixture();
    const installation = installDeferredWorldkitBrowserApi({
      target: {},
      statusElement: { dataset: {} },
      initialize: async ({ trackAdapter }) => {
        trackAdapter(adapter);
        throw new Error("mount failed");
      },
    });

    await expect(installation.initialization).resolves.toBeUndefined();
    expect(adapter.disposeCount).toBe(1);
    await expect(installation.dispose()).resolves.toBeUndefined();
    expect(adapter.disposeCount).toBe(1);
  });
});
