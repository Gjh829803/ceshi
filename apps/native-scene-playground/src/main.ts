import type {
  BabylonRuntimeProjectionV1,
  BabylonWorldRuntimeInitializationStageV1,
} from "@whitebox-world/runtime-babylon";
import {
  BabylonWorldRuntime,
  createBabylonGameplayWorldPortV1,
  FIXED_TIME_STEP_SECONDS,
} from "@whitebox-world/runtime-babylon";
import type {
  FixedInputV1,
  SemanticInputActionV1,
} from "@whitebox-world/runtime-contracts";

import { createCloudRidgeNativeSceneControllerV1 } from
  "./cloud-ridge-scene.js";
import {
  CLOUD_RIDGE_GAMEPLAY_EXECUTION_PLAN_V1,
  CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1,
  cloudRidgeSubjectAssetResolver,
} from "./native-bootstrap.js";
import "./style.css";

const FIXED_INPUT_CONTROLLER_ENTITY_ID = "native-scene-controller";
const CONTROLLED_ENTITY_ID =
  CLOUD_RIDGE_GAMEPLAY_EXECUTION_PLAN_V1.initialControlledEntityId;
const NATIVE_SCENE_FACTORIES_BY_REF: Readonly<
  Record<string, typeof createCloudRidgeNativeSceneControllerV1>
> = Object.freeze({
  "app://native-scene/cloud-ridge": createCloudRidgeNativeSceneControllerV1,
});
const nativeSceneFactory =
  NATIVE_SCENE_FACTORIES_BY_REF[CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.sceneModuleRef];
if (nativeSceneFactory === undefined) {
  throw new Error("WORLDKIT_NATIVE_SCENE_MODULE_REF_UNRESOLVED");
}
const nativeScene = nativeSceneFactory();
if (nativeScene.module.id !== CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.sceneModuleId) {
  throw new Error("WORLDKIT_NATIVE_SCENE_MODULE_ID_MISMATCH");
}

interface NativeSceneSpikeProbeV1 {
  readonly ready: true;
  readonly bootstrap: typeof CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1;
  snapshot(): BabylonRuntimeProjectionV1;
  runFixedInput(input: FixedInputV1): Promise<BabylonRuntimeProjectionV1>;
  setColliderDebugVisible(visible: boolean): void;
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

function possessionTransition(
  controlledEntityId: string,
  establishedSimulationTick: number,
) {
  return Object.freeze({
    kind: "gameplay-transition-plan" as const,
    schemaVersion: 1 as const,
    type: "control.bind" as const,
    commandId: `command.native-scene.bind.${establishedSimulationTick}`,
    expectedStateRevision: 0,
    relationshipChanges: Object.freeze([Object.freeze({
      operation: "add" as const,
      after: Object.freeze({
        id: `possessed-by:native-scene:${establishedSimulationTick}`,
        type: "possessedBy" as const,
        schemaVersion: 1 as const,
        controlledEntityId,
        controllerEntityId: FIXED_INPUT_CONTROLLER_ENTITY_ID,
        establishedSimulationTick,
      }),
    })]),
    actionChanges: Object.freeze([]),
    newlyCommittedActionExecutionIds: Object.freeze([]),
    capacityDelta: Object.freeze({
      relationshipStateCountDelta: 1,
      activeActionStateCountDelta: 0,
      usedActionExecutionIdCountDelta: 0,
      immediateEventCount: 1,
      terminalEventReservationCountDelta: 0,
    }),
  });
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

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "Cloud Ridge Babylon Native scene");
  canvas.tabIndex = 0;
  viewport.prepend(canvas);

  const runtime = await BabylonWorldRuntime.create({
    executionPlan: CLOUD_RIDGE_GAMEPLAY_EXECUTION_PLAN_V1,
    runtimeSessionId: `native-scene-${crypto.randomUUID()}`,
    canvas,
    autoStartRenderLoop: false,
    subjectAssetResolver: cloudRidgeSubjectAssetResolver,
    nativeScene: {
      module: nativeScene.module,
      spawnMarkerId: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.spawnMarkerId,
      budget: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.staticCollisionBudget,
    },
    onInitializationStage(stage) {
      loadingStage.textContent = initializationLabel(stage);
    },
  });
  try {
  const gameplayPort = createBabylonGameplayWorldPortV1(
    runtime,
    FIXED_INPUT_CONTROLLER_ENTITY_ID,
  );
  await gameplayPort.initialize();

  const bindPossession = async (): Promise<void> => {
    const projection = gameplayPort.snapshot();
    const prepared = await gameplayPort.prepareGameplayTransition(
      possessionTransition(CONTROLLED_ENTITY_ID, projection.simulationTick),
    );
    prepared.commitPrepared();
  };
  await bindPossession();

  let inputTail: Promise<BabylonRuntimeProjectionV1> =
    Promise.resolve(runtime.snapshot());
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
    inputTail = inputTail.then(async () => {
      for (let tick = 0; tick < input.ticks; tick += 1) {
        const nextSimulationTick = gameplayPort.snapshot().simulationTick + 1;
        await gameplayPort.runFixedInputTick(
          {
            actions: input.actions,
            ...(input.axes === undefined ? {} : { axes: input.axes }),
            ticks: 1,
          },
          Object.freeze({
            simulationTick: nextSimulationTick,
            activeActionStatesById: Object.freeze({}),
          }),
        );
      }
      return runtime.snapshot();
    });
    return inputTail;
  };

  const setColliderDebugVisible = (visible: boolean): void => {
    nativeScene.setCollisionDebugVisible(visible);
  };

  const reset = async (): Promise<BabylonRuntimeProjectionV1> => {
    await inputTail;
    runtime.reset();
    await bindPossession();
    runtime.adjustCameraView({
      pitchDeltaRadians: -0.15,
      zoomDeltaMeters: 4,
    });
    return runFixedInput({ actions: [], ticks: 50 });
  };

  runtime.adjustCameraView({
    pitchDeltaRadians: -0.15,
    zoomDeltaMeters: 4,
  });
  await runFixedInput({ actions: [], ticks: 50 });
  runtime.resize();
  await runtime.renderFrameWhenReady();

  window.__WORLDKIT_NATIVE_SPIKE__ = Object.freeze({
    ready: true as const,
    bootstrap: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1,
    snapshot: () => runtime.snapshot(),
    runFixedInput,
    setColliderDebugVisible,
    reset,
  });

  loading.classList.add("is-complete");
  stateElement.textContent = "IDLE";
  canvas.focus();

  const pressedCodes = new Set<string>();
  let paused = false;
  let collisionDebugVisible = false;
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
    void gameplayPort.dispose().catch(() => {
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
    runtime.renderFrame();
    frameCount += 1;
    if (timestamp - fpsTimestamp >= 500) {
      fpsElement.textContent = Math.round(
        frameCount * 1_000 / (timestamp - fpsTimestamp),
      ).toString();
      frameCount = 0;
      fpsTimestamp = timestamp;
      updateHud(runtime.snapshot());
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
    if (event.code === "KeyC") {
      collisionDebugVisible = !collisionDebugVisible;
      setColliderDebugVisible(collisionDebugVisible);
    }
  });
  window.addEventListener("keyup", (event) => {
    pressedCodes.delete(event.code);
  });
  window.addEventListener("blur", () => pressedCodes.clear());

  canvas.addEventListener("pointerdown", (event) => {
    activePointerId = event.pointerId;
    previousPointerX = event.clientX;
    previousPointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;
    const deltaX = event.clientX - previousPointerX;
    const deltaY = event.clientY - previousPointerY;
    previousPointerX = event.clientX;
    previousPointerY = event.clientY;
    runtime.adjustCameraView({
      yawDeltaRadians: -deltaX * 0.0045,
      pitchDeltaRadians: -deltaY * 0.0035,
    });
  });
  const endPointer = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    runtime.adjustCameraView({
      zoomDeltaMeters: Math.max(-1.2, Math.min(1.2, event.deltaY * 0.004)),
    });
  }, { passive: false });

  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "▶" : "Ⅱ";
    pauseButton.setAttribute("aria-label", paused ? "继续" : "暂停");
    pressedCodes.clear();
    updateHud(runtime.snapshot());
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
        ticks: 3_150,
      }))
      .then(() => runFixedInput({ actions: [], ticks: 2 }))
      .then((snapshot) => {
        runtime.renderFrame();
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

  const resizeObserver = new ResizeObserver(() => runtime.resize());
  resizeObserver.observe(viewport);
  window.addEventListener("beforeunload", () => {
    disposed = true;
    cancelAnimationFrame(frameRequest);
    resizeObserver.disconnect();
    void gameplayPort.dispose();
  }, { once: true });

  updateHud(runtime.snapshot());
  frameRequest = requestAnimationFrame((timestamp) => {
    void renderLoop(timestamp).catch(failRuntime);
  });
  } catch (error) {
    try {
      await runtime.dispose();
    } catch {
      // Preserve the primary startup failure.
    }
    throw error;
  }
}

void start().catch(showFailure);
