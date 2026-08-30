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
  SemanticInputActionV1,
} from "@whitebox-world/runtime-contracts";
import {
  deriveRuntimeSessionEventIdV1,
  hashNativeEffectiveExecutionBudgetV1,
  WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeIsolatedExecutionRequestV1,
} from "@whitebox-world/runtime-contracts";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { cloudRidgeSubjectAssetResolver } from
  "./subject-asset-resolver.js";
import { createHostedRuntimeBridgeV1 } from "./hosted-runtime-bridge.js";
import { startHostedRuntimeFrameV1 } from "./hosted-runtime-frame.js";
import { NativeRuntimeHostV1 } from "./native-runtime-host.js";
import { loadVerifiedNativeWorldPackageV1 } from
  "./world-package-loader.js";
import "./style.css";

const CLOUD_RIDGE_MAIN_PATH_RUN_TICKS = 1_700;
interface NativeSceneSpikeProbeV1 {
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
    __WORLDKIT_NATIVE_SPIKE__?: NativeSceneSpikeProbeV1;
    __WORLDKIT_HOSTED_RUNTIME__?: Readonly<{
      phase(): string;
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
    terrain: "初始化 Canonical Terrain…",
    "native-scene": "构建山峰、山门与云海…",
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
  const panel = requiredElement<HTMLElement>("[data-error]");
  panel.hidden = false;
  panel.textContent = error instanceof Error
    ? `${error.name}\n${error.message}`
    : String(error);
  requiredElement<HTMLElement>("[data-state]").textContent = "FAILED";
}

async function start(): Promise<void> {
  const viewport = requiredElement<HTMLElement>("[data-viewport]");
  const loading = requiredElement<HTMLElement>("[data-loading]");
  const loadingStage = requiredElement<HTMLElement>("[data-loading-stage]");
  const fpsElement = requiredElement<HTMLElement>("[data-fps]");
  const stateElement = requiredElement<HTMLElement>("[data-state]");
  const positionElement = requiredElement<HTMLElement>("[data-position]");
  const pauseButton = requiredElement<HTMLButtonElement>("[data-pause]");
  const pathCheckButton = requiredElement<HTMLButtonElement>("[data-path-check]");

  const {
    default: cloudRidgeNativeScene,
    moduleBundleContentHash: cloudRidgeModuleBundleContentHash,
  } = await import("virtual:worldkit-cloud-ridge-native-scene");

  const verifiedWorldPackage = await loadVerifiedNativeWorldPackageV1(
    new URL("/world-packages/cloud-ridge/", globalThis.location.origin),
  );
  const controlledEntityId =
    verifiedWorldPackage.worldRuntimeBootstrap.initialControlledEntityId;
  const coordinator = await NativeRuntimeHostV1.create({
    runtimeSessionId: `native-scene-${crypto.randomUUID()}`,
    canvasHost: viewport,
    verifiedWorldPackage,
    loadedSceneModule: cloudRidgeNativeScene,
    loadedSceneModuleBundleContentHash:
      cloudRidgeModuleBundleContentHash,
    subjectAssetResolver: cloudRidgeSubjectAssetResolver,
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

  window.__WORLDKIT_NATIVE_SPIKE__ = Object.freeze({
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

  pathCheckButton.addEventListener("click", () => {
    const wasPaused = paused;
    paused = true;
    pressedCodes.clear();
    pathCheckButton.disabled = true;
    pathCheckButton.textContent = "正在沿主路径前进…";
    void reset()
      .then(() => runFixedInput({
        actions: ["move-forward", "run"],
        ticks: CLOUD_RIDGE_MAIN_PATH_RUN_TICKS,
      }))
      .then(() => runFixedInput({ actions: [], ticks: 2 }))
      .then((snapshot) => {
        activeRuntime().renderFrame();
        updateHud(snapshot);
        const subject = snapshot.subjectStatesByEntityId[controlledEntityId];
        const reached = subject !== undefined &&
          subject.movementMedium === "ground" &&
          subject.positionMetersXYZ[1] > 12 &&
          subject.positionMetersXYZ[2] < -29;
        pathCheckButton.textContent = reached
          ? "主路径通过 ✓"
          : "未到达，请查看位置";
      })
      .catch((error) => {
        pathCheckButton.textContent = "路径测试失败";
        failRuntime(error);
      })
      .finally(() => {
        paused = wasPaused;
        pathCheckButton.disabled = false;
      });
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
  return {
    scene,
    assets: { maximumAssetCount: 64, maximumAssetBytes: 64_000_000, maximumTextureCount: 32, maximumTextureBytes: 64_000_000 },
    runtime: { maximumSceneNodeCount: 2_000, maximumMaterialCount: 256, maximumShaderCount: 256, maximumPhysicsBodyCount: 256 },
    process: { maximumWallTimeMilliseconds: 120_000, maximumCpuTimeMilliseconds: 120_000, maximumMemoryBytes: 1_000_000_000, maximumProcessCount: 1 },
    protocol: { maximumInboundMessageBytes: 2_000_000, maximumOutboundMessageBytes: 2_000_000, maximumReceiptBytes: 2_000_000, maximumDiagnosticCount: 64, maximumLogBytes: 100_000 },
  };
}

async function startHostedShell(): Promise<void> {
  const query = new URLSearchParams(location.search);
  const runtimeOrigin = query.get("runtimeOrigin") ?? "http://127.0.0.1:5175";
  const runtimeSessionId = `runtime.hosted.browser.${crypto.randomUUID()}`;
  const sessionNonce = `nonce.${crypto.randomUUID()}`;
  const viewport = requiredElement<HTMLElement>("[data-viewport]");
  viewport.replaceChildren();
  const frame = document.createElement("iframe");
  frame.className = "hosted-runtime-frame";
  frame.src = `${runtimeOrigin}/?hosted-runtime-frame=1&shellOrigin=${encodeURIComponent(location.origin)}&runtimeSessionId=${encodeURIComponent(runtimeSessionId)}&sessionNonce=${encodeURIComponent(sessionNonce)}`;
  const bridge = createHostedRuntimeBridgeV1({
    frame,
    runtimeOrigin,
    runtimeSessionId,
    sessionNonce,
    protocolBudget: browserProtocolBudget().protocol,
  });
  // Sandbox and credentialless policy must be installed before first navigation.
  viewport.append(frame);
  window.__WORLDKIT_HOSTED_RUNTIME__ = Object.freeze({
    phase: () => bridge.phase(),
    submit: (request) => bridge.submit(request),
    frame,
  });
  await bridge.waitUntilReady();
  requiredElement<HTMLElement>("[data-state]").textContent = "READY";
  window.addEventListener("beforeunload", () => bridge.dispose(), { once: true });
}

async function startHostedFrame(): Promise<void> {
  const query = new URLSearchParams(location.search);
  const shellOrigin = query.get("shellOrigin");
  const runtimeSessionId = query.get("runtimeSessionId");
  const sessionNonce = query.get("sessionNonce");
  if (shellOrigin === null || runtimeSessionId === null || sessionNonce === null) {
    throw new Error("WORLDKIT_HOSTED_RUNTIME_FRAME_PARAMETERS_MISSING");
  }
  const viewport = requiredElement<HTMLElement>("[data-viewport]");
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  viewport.replaceChildren(canvas);
  const verified = await loadVerifiedNativeWorldPackageV1(
    new URL("/world-packages/cloud-ridge/", location.origin),
  );
  const moduleImport = await import("virtual:worldkit-cloud-ridge-native-scene");
  const effectiveBudget = browserProtocolBudget(
    verified.manifest.resourceBudget,
  );
  const requestBody = {
    kind: "native-isolated-execution-request" as const,
    schemaVersion: 1 as const,
    id: `native-isolated-execution-request.${runtimeSessionId}`,
    runtimeSessionId,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    sceneModuleBundleHash: verified.sceneModuleBundleHash,
    nativeSceneContributionHash: verified.manifest.sceneSource.nativeSceneContributionHash,
    nativeExecutionTrustProfileRef: "worldkit://native-execution-trust-profile/hosted-isolated@1",
    nativeExecutionTrustProfileHash: `sha256:${"a".repeat(64)}` as const,
    runnerIdentityRef: "worldkit://native-isolation-runner/browser-origin@1",
    runnerImageDigest: `sha256:${"b".repeat(64)}` as const,
    sandboxPolicyHash: `sha256:${"c".repeat(64)}` as const,
    effectiveBudget,
    effectiveBudgetHash: hashNativeEffectiveExecutionBudgetV1(effectiveBudget),
    requestedOperation: { mode: "interactive-session" as const },
    sessionNonce,
  } satisfies NativeIsolatedExecutionRequestV1;
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
    subjectAssetResolver: cloudRidgeSubjectAssetResolver,
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
    protocolBudget: effectiveBudget.protocol,
  });
  const pressedCodes = new Set<string>();
  const contextualCodes = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ShiftLeft", "ShiftRight", "Space",
  ]);
  let localRequestSequence = 0;
  let localInputTail = Promise.resolve();
  let previousTimestamp = performance.now();
  let accumulatedSeconds = 0;
  let frameRequest = 0;
  const runLocalInput = (ticks: number): void => {
    const requestSequence = ++localRequestSequence;
    localInputTail = localInputTail.then(async () => {
      const receipt = await entry.submit({
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: `request.browser-local-input.${requestSequence}`,
        runtimeSessionId,
        type: "fixed-input.run",
        input: {
          actions: semanticActionsForCodes(pressedCodes),
          ticks,
        },
      });
      if (receipt.status !== "succeeded") {
        throw new Error("WORLDKIT_HOSTED_RUNTIME_LOCAL_INPUT_REJECTED");
      }
    }).catch(showFailure);
  };
  const renderLoop = (timestamp: number): void => {
    if (hostedFrame.isDisposed()) return;
    const elapsedSeconds = Math.min(
      0.1,
      Math.max(0, (timestamp - previousTimestamp) / 1_000),
    );
    previousTimestamp = timestamp;
    accumulatedSeconds += elapsedSeconds;
    if (pressedCodes.size > 0) {
      const ticks = Math.min(
        5,
        Math.floor(accumulatedSeconds / FIXED_TIME_STEP_SECONDS),
      );
      if (ticks > 0) {
        accumulatedSeconds -= ticks * FIXED_TIME_STEP_SECONDS;
        runLocalInput(ticks);
      }
    } else {
      accumulatedSeconds = 0;
    }
    entry.renderFrame();
    if (!hostedFrame.isDisposed()) {
      frameRequest = requestAnimationFrame(renderLoop);
    }
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
  frameRequest = requestAnimationFrame(renderLoop);
  canvas.focus();
}

const mode = new URLSearchParams(location.search);
void (mode.has("hosted-runtime-frame")
  ? startHostedFrame()
  : mode.has("hosted")
    ? startHostedShell()
    : start()).catch(showFailure);
