import type {
  BabylonRuntimeProjectionV1,
  BabylonWorldRuntimeInitializationStageV1,
} from "@whitebox-world/runtime-babylon";
import { FIXED_TIME_STEP_SECONDS } from "@whitebox-world/runtime-babylon";
import type {
  FixedInputV1,
  SemanticInputActionV1,
} from "@whitebox-world/runtime-contracts";

import cloudRidgeNativeScene from "./scene.js";
import {
  CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1,
  CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1,
  cloudRidgeSubjectAssetResolver,
} from "./native-bootstrap.js";
import { NativeRuntimeHostV1 } from "./native-runtime-host.js";
import { loadVerifiedNativeWorldPackageV1 } from
  "./world-package-loader.js";
import "./style.css";

const CLOUD_RIDGE_MAIN_PATH_RUN_TICKS = 1_700;
const CONTROLLED_ENTITY_ID =
  CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.initialControlledEntityId;

interface NativeSceneSpikeProbeV1 {
  readonly ready: true;
  readonly bootstrap: typeof CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1;
  snapshot(): BabylonRuntimeProjectionV1;
  runFixedInput(input: FixedInputV1): Promise<BabylonRuntimeProjectionV1>;
  audit(): Readonly<{
    contributionHash: `sha256:${string}`;
    spawnMarkerId: string;
    colliderIds: readonly string[];
    colliderSubshapeIds: readonly string[];
  }>;
  reset(): Promise<BabylonRuntimeProjectionV1>;
}

declare global {
  interface Window {
    __WORLDKIT_NATIVE_SPIKE__?: NativeSceneSpikeProbeV1;
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

  const verifiedWorldPackage = await loadVerifiedNativeWorldPackageV1(
    new URL("/world-packages/cloud-ridge/", globalThis.location.origin),
  );
  const coordinator = await NativeRuntimeHostV1.create({
    runtimeSessionId: `native-scene-${crypto.randomUUID()}`,
    canvasHost: viewport,
    verifiedWorldPackage,
    loadedSceneModule: cloudRidgeNativeScene,
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
    bootstrap: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1,
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
    const subject = snapshot.subjectStatesByEntityId[CONTROLLED_ENTITY_ID];
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
        const subject = snapshot.subjectStatesByEntityId[CONTROLLED_ENTITY_ID];
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

void start().catch(showFailure);
