import type {
  BabylonRuntimeProjectionV1,
  BabylonWorldRuntimeInitializationStageV1,
} from "@whitebox-world/runtime-babylon";
import { FIXED_TIME_STEP_SECONDS } from "@whitebox-world/runtime-babylon";
import {
  createBabylonNativeIsolatedRuntimeEntryV1,
} from "@whitebox-world/runtime-babylon";
import type {
  BabylonNativeSceneBootstrapV1,
  FixedInputV1,
  FormalWorldCaptureSdkOwnerIdentityV1,
  SemanticInputActionV1,
} from "@whitebox-world/runtime-contracts";
import {
  deriveRuntimeSessionEventIdV1,
  WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
  type NativeEffectiveExecutionBudgetV1,
} from "@whitebox-world/runtime-contracts";
import { admitHostedNativeExecutionRequestV1 } from
  "@whitebox-world/runtime-host";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { nativeSceneSubjectAssetResolver } from
  "./subject-asset-resolver.js";
import { createHostedRuntimeBridgeV1 } from "./hosted-runtime-bridge.js";
import {
  prepareHostedRuntimeFrameDocumentV1,
  startHostedRuntimeFrameV1,
} from "./hosted-runtime-frame.js";
import { createHostedNativeExecutionBudgetV1 } from
  "./hosted-native-execution-budget.js";
import {
  startHostedFormalCaptureFrameRouteV1,
  startHostedFormalCaptureShellRouteV1,
} from "./hosted-formal-capture-route.js";
import { renderHostedInteractiveFrameV1 } from
  "./hosted-interactive-input.js";
import { NativeRuntimeHostV1 } from "./native-runtime-host.js";
import { presentPageFailureV1 } from "./page-failure.js";
import { loadVerifiedNativeWorldPackageV1 } from
  "./world-package-loader.js";
import "./style.css";
import { CanvasRecorder } from "@whitebox-world/browser-recording/canvas-recorder";
import { installHostedRecordingControls } from "./hosted-recording-controls.js";
import { installHostedRecordingWorkbench, type HostedRecordingContext } from "./hosted-recording-workbench.js";
import "@whitebox-world/browser-recording/workbench.css";

declare const __WORLDKIT_RECORDING_CONTEXT__: HostedRecordingContext | null;

declare const __WORLDKIT_HOSTED_BROWSER_RUNNER_DIGEST__: `sha256:${string}`;
declare const __WORLDKIT_HOSTED_BROWSER_POLICY_HASH__: `sha256:${string}`;
declare const __WORLDKIT_HOSTED_RUNTIME_ORIGIN__: string;
declare const __WORLDKIT_HOSTED_SHELL_ORIGIN__: string;
declare const __WORLDKIT_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES__:
  readonly FormalWorldCaptureSdkOwnerIdentityV1[];
declare const __WORLDKIT_NATIVE_VERIFIER_PROBE_ENABLED__: boolean;
interface NativePackageVerifierProbeV1 {
  readonly ready: true;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  snapshot(): BabylonRuntimeProjectionV1;
  runFixedInput(input: FixedInputV1): Promise<BabylonRuntimeProjectionV1>;
  audit(): Readonly<{
    contributionHash: `sha256:${string}`;
    worldSessionId: string;
    successfulRuntimeCreateCount: number;
    spawnMarkerId: string;
    colliderIds: readonly string[];
    colliderSubshapeIds: readonly string[];
  }>;
  reset(): Promise<BabylonRuntimeProjectionV1>;
}

declare global {
  interface Window {
    __WORLDKIT_NATIVE_VERIFIER__?: NativePackageVerifierProbeV1;
    __WORLDKIT_HOSTED_RUNTIME__?: Readonly<{
      phase(): string;
      waitUntilReady(): Promise<import("@whitebox-world/runtime-contracts").RuntimeSessionEventV1>;
      submit(request: import("@whitebox-world/runtime-contracts").RuntimeSessionRequestV1): Promise<unknown>;
      frame: HTMLIFrameElement;
    }>;
  }
}

function requiredElement<ElementType extends Element>(
  selector: string,
): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (element === null) throw new Error(`Missing page element '${selector}'.`);
  return element;
}

function initializationLabel(
  stage: BabylonWorldRuntimeInitializationStageV1,
): string {
  const labels: Readonly<Record<BabylonWorldRuntimeInitializationStageV1, string>> = {
    engine: "创建 Babylon Engine…",
    scene: "创建 Native Scene…",
    havok: "初始化 SDK Havok…",
    terrain: "初始化世界表面…",
    "native-scene": "构建已验证 Native 场景…",
    subjects: "载入 SDK G Bot 与动作…",
    camera: "绑定 SDK 第三人称相机…",
    ready: "完成，正在生成首帧…",
  };
  return labels[stage];
}

function semanticActionsForCodes(
  pressedCodes: ReadonlySet<string>,
): readonly SemanticInputActionV1[] {
  const actions: SemanticInputActionV1[] = [];
  if (pressedCodes.has("KeyW")) actions.push("move-forward");
  if (pressedCodes.has("KeyS")) actions.push("move-backward");
  if (pressedCodes.has("KeyA")) actions.push("move-left");
  if (pressedCodes.has("KeyD")) actions.push("move-right");
  if (
    pressedCodes.has("ShiftLeft") ||
    pressedCodes.has("ShiftRight")
  ) actions.push("run");
  if (pressedCodes.has("Space")) actions.push("jump");
  return Object.freeze(actions);
}

function showFailure(error: unknown): void {
  presentPageFailureV1(document, error);
}

async function startVerifierProbe(): Promise<void> {
  const viewport = requiredElement<HTMLElement>("[data-viewport]");
  const loading = requiredElement<HTMLElement>("[data-loading]");
  const loadingStage = requiredElement<HTMLElement>("[data-loading-stage]");
  const fpsElement = requiredElement<HTMLElement>("[data-fps]");
  const stateElement = requiredElement<HTMLElement>("[data-state]");
  const positionElement = requiredElement<HTMLElement>("[data-position]");
  const pauseButton = requiredElement<HTMLButtonElement>("[data-pause]");
  const {
    default: nativeSceneModule,
    moduleBundleContentHash: nativeSceneModuleBundleContentHash,
  } = await import("virtual:worldkit-native-scene");

  const verifiedWorldPackage = await loadVerifiedNativeWorldPackageV1(
    new URL("/__worldkit/native-package/", globalThis.location.origin),
  );
  const controlledEntityId =
    verifiedWorldPackage.worldRuntimeBootstrap.initialControlledEntityId;
  const coordinator = await NativeRuntimeHostV1.create({
    runtimeSessionId: `native-scene-${crypto.randomUUID()}`,
    canvasHost: viewport,
    verifiedWorldPackage,
    loadedSceneModule: nativeSceneModule,
    loadedSceneModuleBundleContentHash:
      nativeSceneModuleBundleContentHash,
    subjectAssetResolver: nativeSceneSubjectAssetResolver,
    onInitializationStage(stage) {
      loadingStage.textContent = initializationLabel(stage);
    },
  });
  const canvas = () => coordinator.canvas();
  const activeRuntime = () => coordinator.runtime();
  try {
  let inputTail: Promise<BabylonRuntimeProjectionV1> =
    Promise.resolve(coordinator.snapshot());
  const runFixedInput = (
    input: FixedInputV1,
  ): Promise<BabylonRuntimeProjectionV1> => {
    if (
      !Number.isSafeInteger(input.ticks) ||
      input.ticks < 0 ||
      input.ticks > 36_000
    ) {
      return Promise.reject(new RangeError(
        "Fixed input ticks must be an integer from 0 through 36000.",
      ));
    }
    inputTail = inputTail.then(() => coordinator.runFixedInput(input));
    return inputTail;
  };

  const reset = async (): Promise<BabylonRuntimeProjectionV1> => {
    await inputTail;
    await coordinator.reset();
    activeRuntime().adjustCameraView({
      pitchDeltaRadians: -0.15,
      zoomDeltaMeters: 4,
    });
    return runFixedInput({ actions: [], ticks: 50 });
  };

  activeRuntime().adjustCameraView({
    pitchDeltaRadians: -0.15,
    zoomDeltaMeters: 4,
  });
  await runFixedInput({ actions: [], ticks: 50 });
  activeRuntime().resize();
  await activeRuntime().renderFrameWhenReady();

  window.__WORLDKIT_NATIVE_VERIFIER__ = Object.freeze({
    ready: true as const,
    bootstrap: verifiedWorldPackage.bootstrap,
    snapshot: () => coordinator.snapshot(),
    runFixedInput,
    audit: () => coordinator.audit(),
    reset,
  });

  loading.classList.add("is-complete");
  stateElement.textContent = "IDLE";
  canvas().focus();

  const pressedCodes = new Set<string>();
  let paused = false;
  let frameRequest = 0;
  let previousTimestamp = performance.now();
  let accumulatedSeconds = 0;
  let frameCount = 0;
  let fpsTimestamp = previousTimestamp;
  let activePointerId: number | undefined;
  let previousPointerX = 0;
  let previousPointerY = 0;
  let disposed = false;

  const failRuntime = (error: unknown): void => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frameRequest);
    showFailure(error);
    void coordinator.dispose().catch(() => {
      // The primary Runtime failure remains the visible diagnostic.
    });
  };

  const updateHud = (snapshot: BabylonRuntimeProjectionV1): void => {
    const subject = snapshot.subjectStatesByEntityId[controlledEntityId];
    if (subject === undefined) return;
    stateElement.textContent = paused
      ? "PAUSED"
      : `${subject.activeActionId.toUpperCase()} · ${subject.movementMedium.toUpperCase()}`;
    positionElement.textContent = subject.positionMetersXYZ
      .map((value) => value.toFixed(1))
      .join(" / ");
  };

  const renderLoop = async (timestamp: number): Promise<void> => {
    if (disposed) return;
    const elapsedSeconds = Math.min(
      0.1,
      Math.max(0, (timestamp - previousTimestamp) / 1_000),
    );
    previousTimestamp = timestamp;
    if (!paused) accumulatedSeconds += elapsedSeconds;
    const ticks = paused
      ? 0
      : Math.min(5, Math.floor(accumulatedSeconds / FIXED_TIME_STEP_SECONDS));
    if (ticks > 0) {
      accumulatedSeconds -= ticks * FIXED_TIME_STEP_SECONDS;
      await runFixedInput({
        actions: semanticActionsForCodes(pressedCodes),
        ticks,
      });
    }
    activeRuntime().renderFrame();
    frameCount += 1;
    if (timestamp - fpsTimestamp >= 500) {
      fpsElement.textContent = Math.round(
        frameCount * 1_000 / (timestamp - fpsTimestamp),
      ).toString();
      frameCount = 0;
      fpsTimestamp = timestamp;
      updateHud(activeRuntime().snapshot());
    }
    frameRequest = requestAnimationFrame((nextTimestamp) => {
      void renderLoop(nextTimestamp).catch(failRuntime);
    });
  };

  const contextualCodes = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ShiftLeft", "ShiftRight", "Space",
  ]);
  window.addEventListener("keydown", (event) => {
    if (contextualCodes.has(event.code)) {
      event.preventDefault();
      pressedCodes.add(event.code);
    }
    if (event.repeat) return;
    if (event.code === "KeyR") {
      event.preventDefault();
      pressedCodes.clear();
      void reset().then(updateHud).catch(failRuntime);
    }
  });
  window.addEventListener("keyup", (event) => {
    pressedCodes.delete(event.code);
  });
  window.addEventListener("blur", () => pressedCodes.clear());

  viewport.addEventListener("pointerdown", (event) => {
    activePointerId = event.pointerId;
    previousPointerX = event.clientX;
    previousPointerY = event.clientY;
    viewport.setPointerCapture(event.pointerId);
    canvas().focus();
  });
  viewport.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;
    const deltaX = event.clientX - previousPointerX;
    const deltaY = event.clientY - previousPointerY;
    previousPointerX = event.clientX;
    previousPointerY = event.clientY;
    activeRuntime().adjustCameraView({
      yawDeltaRadians: -deltaX * 0.0045,
      pitchDeltaRadians: -deltaY * 0.0035,
    });
  });
  const endPointer = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = undefined;
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };
  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);
  viewport.addEventListener("contextmenu", (event) => event.preventDefault());
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    activeRuntime().adjustCameraView({
      zoomDeltaMeters: Math.max(-1.2, Math.min(1.2, event.deltaY * 0.004)),
    });
  }, { passive: false });

  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "▶" : "Ⅱ";
    pauseButton.setAttribute("aria-label", paused ? "继续" : "暂停");
    pressedCodes.clear();
    updateHud(activeRuntime().snapshot());
  });

  const resizeObserver = new ResizeObserver(() => activeRuntime().resize());
  resizeObserver.observe(viewport);
  window.addEventListener("beforeunload", () => {
    disposed = true;
    cancelAnimationFrame(frameRequest);
    resizeObserver.disconnect();
    void coordinator.dispose();
  }, { once: true });

  updateHud(activeRuntime().snapshot());
  frameRequest = requestAnimationFrame((timestamp) => {
    void renderLoop(timestamp).catch(failRuntime);
  });
  } catch (error) {
    try {
      await coordinator.dispose();
    } catch {
      // Preserve the primary startup failure.
    }
    throw error;
  }
}

function browserProtocolBudget(
  scene: NativeEffectiveExecutionBudgetV1["scene"] = {
    maximumVertices: 0,
    maximumTriangles: 0,
    maximumColliders: 0,
  },
): NativeEffectiveExecutionBudgetV1 {
  return createHostedNativeExecutionBudgetV1({
    mode: "interactive-session",
    scene,
  });
}

async function startHostedShell(): Promise<void> {
  const runtimeOrigin = __WORLDKIT_HOSTED_RUNTIME_ORIGIN__;
  if (location.origin !== __WORLDKIT_HOSTED_SHELL_ORIGIN__) {
    throw new Error("WORLDKIT_HOSTED_SHELL_ORIGIN_MISMATCH");
  }
  const runtimeSessionId = `runtime.hosted.browser.${crypto.randomUUID()}`;
  const sessionNonce = `nonce.${crypto.randomUUID()}`;
  const viewport = requiredElement<HTMLElement>("[data-viewport]");
  viewport.replaceChildren();
  const frame = document.createElement("iframe");
  frame.className = "hosted-runtime-frame";
  const frameUrl = new URL("/", runtimeOrigin);
  frameUrl.searchParams.set("hosted-runtime-frame", "1");
  frameUrl.searchParams.set("runtimeSessionId", runtimeSessionId);
  frameUrl.searchParams.set("sessionNonce", sessionNonce);
  frame.src = frameUrl.href;
  const bridge = createHostedRuntimeBridgeV1({
    frame,
    runtimeOrigin,
    runtimeSessionId,
    sessionNonce,
    protocolBudget: browserProtocolBudget().protocol,
    recordingEnabled: true,
  });
  // Sandbox and credentialless policy must be installed before first navigation.
  viewport.append(frame);
  let recordingControls: ReturnType<typeof installHostedRecordingControls> | undefined;
  let recordingWorkbench: ReturnType<typeof installHostedRecordingWorkbench> | undefined;
  let disposed = false;
  window.addEventListener("beforeunload", () => {
    disposed = true;
    recordingControls?.dispose();
    recordingWorkbench?.dispose();
    bridge.dispose();
  }, { once: true });
  window.__WORLDKIT_HOSTED_RUNTIME__ = Object.freeze({
    phase: () => bridge.phase(),
    waitUntilReady: () => bridge.waitUntilReady(),
    submit: (request) => bridge.submit(request),
    frame,
  });
  const ready = await bridge.waitUntilReady();
  if (disposed) return;
  if (ready.type !== "ready") throw new Error("NATIVE_RECORDING_RUNTIME_NOT_READY");
  try {
    recordingWorkbench = installHostedRecordingWorkbench({
      root: requiredElement<HTMLElement>("[data-recording-workbench]"),
      context: __WORLDKIT_RECORDING_CONTEXT__,
      worldPackageRootHash: ready.worldPackageRootHash,
    });
  } catch (error) {
    bridge.dispose();
    throw error;
  }
  bridge.recording().onDisposed(() => recordingWorkbench?.dispose());
  requiredElement<HTMLElement>("[data-state]").textContent = "READY";
  recordingControls = installHostedRecordingControls({
    button: requiredElement<HTMLButtonElement>("[data-record]"),
    time: requiredElement<HTMLElement>("[data-recording-time]"),
    status: requiredElement<HTMLElement>("[data-recording-status]"),
    client: bridge.recording(),
    save: result => recordingWorkbench!.save(result),
    focusCanvas: () => frame.contentWindow?.focus(),
  });
  requiredElement<HTMLElement>("[data-recording-panel]").hidden = false;
  requiredElement<HTMLElement>("[data-recording-status]").textContent = __WORLDKIT_RECORDING_CONTEXT__
    ? "停止后保存到录制列表；上传失败会下载原始备份" : "停止后下载本地白膜录屏";
}

async function startHostedFrame(): Promise<void> {
  prepareHostedRuntimeFrameDocumentV1(document);
  const query = new URLSearchParams(location.search);
  const shellOrigin = __WORLDKIT_HOSTED_SHELL_ORIGIN__;
  const runtimeSessionId = query.get("runtimeSessionId");
  const sessionNonce = query.get("sessionNonce");
  if (location.origin !== __WORLDKIT_HOSTED_RUNTIME_ORIGIN__) {
    throw new Error("WORLDKIT_HOSTED_RUNTIME_ORIGIN_MISMATCH");
  }
  if (runtimeSessionId === null || sessionNonce === null) {
    throw new Error("WORLDKIT_HOSTED_RUNTIME_FRAME_PARAMETERS_MISSING");
  }
  const viewport = requiredElement<HTMLElement>("[data-viewport]");
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  viewport.replaceChildren(canvas);
  const verified = await loadVerifiedNativeWorldPackageV1(
    new URL("/__worldkit/native-package/", location.origin),
  );
  const moduleImport = await import("virtual:worldkit-native-scene");
  const executionBudgetCap = browserProtocolBudget(
    verified.manifest.resourceBudget,
  );
  const requestBody = admitHostedNativeExecutionRequestV1({
    id: `native-isolated-execution-request.${runtimeSessionId}`,
    runtimeSessionId,
    verifiedWorldPackage: verified,
    sceneProfileBudget: verified.manifest.resourceBudget,
    hostHardCap: executionBudgetCap,
    tenantCap: executionBudgetCap,
    runnerIdentityRef: "worldkit://native-isolation-runner/browser-origin@1",
    runnerImageDigest: __WORLDKIT_HOSTED_BROWSER_RUNNER_DIGEST__,
    sandboxPolicyHash: __WORLDKIT_HOSTED_BROWSER_POLICY_HASH__,
    requestedOperation: { mode: "interactive-session" },
    sessionNonce,
  });
  const entry = await createBabylonNativeIsolatedRuntimeEntryV1({
    request: requestBody,
    verifiedWorldPackage: verified,
    moduleLoader: { load: async () => moduleImport.default },
    engineFactory: () => {
      return new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
    },
    subjectAssetResolver: nativeSceneSubjectAssetResolver,
  });
  const snapshot = entry.initialSnapshot();
  const readyBody = {
    kind: "worldkit-runtime-session-event" as const,
    schemaVersion: 1 as const,
    protocolVersion: 1 as const,
    sequence: 1,
    runtimeSessionId,
    worldSessionId: snapshot.worldSessionId,
    type: "ready" as const,
    runtimeSessionUri: `worldkit://runtime-session/${runtimeSessionId}` as const,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    fixedInputControllerEntityId: "native-isolation-controller",
    supportedRequestTypes: WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
  };
  const hostedFrame = startHostedRuntimeFrameV1({
    entry,
    readyEvent: { ...readyBody, id: deriveRuntimeSessionEventIdV1(readyBody) },
    shellOrigin,
    runtimeSessionId,
    sessionNonce,
    protocolBudget: requestBody.effectiveBudget.protocol,
    createRecorder: () => new CanvasRecorder(canvas),
  });
  const pressedCodes = new Set<string>();
  const contextualCodes = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ShiftLeft", "ShiftRight", "Space",
  ]);
  let localRequestSequence = 0;
  let previousTimestamp: number | undefined;
  let accumulatedSeconds = 0;
  let frameRequest = 0;
  const runLocalInput = async (input: FixedInputV1): Promise<void> => {
    const requestSequence = ++localRequestSequence;
    const receipt = await entry.submit({
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: `request.browser-local-input.${requestSequence}`,
      runtimeSessionId,
      type: "fixed-input.run",
      input,
    });
    if (receipt.status !== "succeeded") {
      throw new Error("WORLDKIT_HOSTED_RUNTIME_LOCAL_INPUT_REJECTED");
    }
  };
  const renderLoop = async (timestamp: number): Promise<void> => {
    if (hostedFrame.isDisposed()) return;
    const elapsedSeconds = previousTimestamp === undefined
      ? 0 : Math.max(0, (timestamp - previousTimestamp) / 1_000);
    previousTimestamp = timestamp;
    accumulatedSeconds += elapsedSeconds;
    accumulatedSeconds = await renderHostedInteractiveFrameV1({
      accumulatedSeconds,
      pressedCodes,
      runFixedInput: runLocalInput,
      renderFrame: (alpha) => { entry.renderFrame(alpha); },
      isDisposed: () => hostedFrame.isDisposed(),
    });
    if (!hostedFrame.isDisposed()) {
      frameRequest = requestAnimationFrame(scheduleRender);
    }
  };
  const scheduleRender = (timestamp: number): void => {
    void renderLoop(timestamp).catch(showFailure);
  };
  window.addEventListener("keydown", (event) => {
    if (!contextualCodes.has(event.code)) return;
    event.preventDefault();
    pressedCodes.add(event.code);
  });
  window.addEventListener("keyup", (event) => pressedCodes.delete(event.code));
  window.addEventListener("blur", () => pressedCodes.clear());
  canvas.addEventListener("pointerdown", (event) => {
    canvas.focus();
    canvas.setPointerCapture(event.pointerId);
  });
  const releasePointer = (event: PointerEvent): void => {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("resize", () => entry.resize());
  window.addEventListener("beforeunload", () => {
    cancelAnimationFrame(frameRequest);
    pressedCodes.clear();
    void hostedFrame.dispose();
  }, { once: true });
  frameRequest = requestAnimationFrame(scheduleRender);
  canvas.focus();
}

const mode = new URLSearchParams(location.search);
const hostedFormalCaptureConstants = Object.freeze({
  hostedBrowserRunnerDigest: __WORLDKIT_HOSTED_BROWSER_RUNNER_DIGEST__,
  hostedBrowserPolicyHash: __WORLDKIT_HOSTED_BROWSER_POLICY_HASH__,
  runtimeOrigin: __WORLDKIT_HOSTED_RUNTIME_ORIGIN__,
  shellOrigin: __WORLDKIT_HOSTED_SHELL_ORIGIN__,
  sdkOwnerIdentities: __WORLDKIT_FORMAL_CAPTURE_SDK_OWNER_IDENTITIES__,
});
void (mode.has("hosted-formal-capture-frame")
  ? startHostedFormalCaptureFrameRouteV1({
      constants: hostedFormalCaptureConstants,
      viewport: requiredElement<HTMLElement>("[data-viewport]"),
      search: location.search,
    })
  : mode.has("hosted-formal-capture")
    ? startHostedFormalCaptureShellRouteV1({
        constants: hostedFormalCaptureConstants,
        viewport: requiredElement<HTMLElement>("[data-viewport]"),
        search: location.search,
      }).then(() => undefined)
    : mode.has("hosted-runtime-frame")
      ? startHostedFrame()
      : mode.has("hosted")
        ? startHostedShell()
        : __WORLDKIT_NATIVE_VERIFIER_PROBE_ENABLED__ &&
            mode.size === 1 &&
            mode.get("verifier-native-package") === "1"
          ? startVerifierProbe()
          : Promise.reject(new Error(
              "WORLDKIT_NATIVE_HARNESS_MODE_REQUIRED",
            ))).catch(showFailure);
