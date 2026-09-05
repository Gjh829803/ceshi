import { parseGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import type { BabylonNativeSceneContributionV1 } from "@whitebox-world/native-babylon/host";
import {
  BabylonWorldRuntime,
  createBabylonGameplayWorldPortV1,
  FIXED_TIME_STEP_SECONDS,
  type BabylonRuntimeProjectionV1,
  type SubjectAssetResolverV1,
} from "@whitebox-world/runtime-babylon";
import {
  parseBabylonNativeSceneBootstrapV1,
  parseFixedInputV1,
  parseWorldRuntimeBootstrapV1,
  type FixedInputV1,
  type SemanticInputActionV1,
} from "@whitebox-world/runtime-contracts";
import creatorModule from "virtual:creator-scene";
import {
  runtimeBootstrap,
  gameplayBootstrap,
  nativeBootstrap,
  assetUrls,
  creatorConfig,
} from "virtual:creator-config";
import {
  creatorCaptureDimensionsV1,
  creatorTriviewDirectionV1,
  type CreatorBrowserApiV1,
  type CreatorCameraAdjustmentV1,
  type CreatorCaptureRequestV1,
  type CreatorCaptureResultV1,
} from "./browser-contract.js";
import "./style.css";

const CONTROLLER_ENTITY_ID = "creator-preview-controller";
const INITIAL_SETTLE_TICKS = 60;
const errors: string[] = [];

function element<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (value === null) throw new Error(`CREATOR_ELEMENT_MISSING: ${selector}`);
  return value;
}

function setStatus(phase: "loading" | "ready" | "failed" | "disposed"): void {
  window.__WORLDKIT_CREATOR_STATUS__ = Object.freeze({
    phase,
    errors: Object.freeze([...errors]),
  });
}

function recordFailure(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (!errors.includes(message)) errors.push(message);
  const output = element<HTMLElement>("[data-error]");
  output.hidden = false;
  output.textContent = errors.join("\n");
  setStatus("failed");
}

function possessionTransition(controlledEntityId: string, simulationTick: number) {
  return Object.freeze({
    kind: "gameplay-transition-plan" as const,
    schemaVersion: 1 as const,
    type: "control.bind" as const,
    commandId: `command.creator.bind.${simulationTick}`,
    expectedStateRevision: 0,
    relationshipChanges: Object.freeze([Object.freeze({
      operation: "add" as const,
      after: Object.freeze({
        id: `possessed-by:creator:${simulationTick}`,
        type: "possessedBy" as const,
        schemaVersion: 1 as const,
        controlledEntityId,
        controllerEntityId: CONTROLLER_ENTITY_ID,
        establishedSimulationTick: simulationTick,
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

function semanticActions(keys: ReadonlySet<string>): readonly SemanticInputActionV1[] {
  const actions: SemanticInputActionV1[] = [];
  if (keys.has("KeyW")) actions.push("move-forward");
  if (keys.has("KeyS")) actions.push("move-backward");
  if (keys.has("KeyA")) actions.push("move-left");
  if (keys.has("KeyD")) actions.push("move-right");
  if (keys.has("ShiftLeft") || keys.has("ShiftRight")) actions.push("run");
  if (keys.has("Space")) actions.push("jump");
  return Object.freeze(actions);
}

const subjectAssetResolver: SubjectAssetResolverV1 = Object.freeze({
  async resolveSubjectAsset(request: Parameters<SubjectAssetResolverV1["resolveSubjectAsset"]>[0]) {
    const assetPath = assetUrls[request.subjectAssetRef];
    if (assetPath === undefined) throw new Error("CREATOR_SUBJECT_ASSET_NOT_DECLARED");
    const assetUrl = new URL(assetPath, location.href);
    if (assetUrl.origin !== location.origin || !["http:", "https:"].includes(assetUrl.protocol)) {
      throw new Error("CREATOR_SUBJECT_ASSET_ORIGIN_MISMATCH");
    }
    assetUrl.searchParams.set("worldkit-content-hash", request.artifactContentHash);
    const response = await fetch(assetUrl, {
      mode: "same-origin",
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok || response.redirected) throw new Error("CREATOR_SUBJECT_ASSET_UNAVAILABLE");
    // SubjectAssetCache owns byte-length, hash, inventory, rig and animation validation.
    return Object.freeze({
      bytes: new Uint8Array(await response.arrayBuffer()),
      sourceLabel: assetUrl.pathname,
    });
  },
});

async function start(): Promise<void> {
  setStatus("loading");
  const canvas = element<HTMLCanvasElement>("[data-canvas]");
  const loading = element<HTMLElement>("[data-loading]");
  const playButton = element<HTMLButtonElement>("[data-play]");
  const resetButton = element<HTMLButtonElement>("[data-reset]");
  const status = element<HTMLOutputElement>("[data-status]");
  element<HTMLElement>("[data-scene-name]").textContent = creatorConfig.sceneId;
  const worldBootstrap = parseWorldRuntimeBootstrapV1(runtimeBootstrap);
  const controlledEntityId = worldBootstrap.initialControlledEntityId;
  let admission: Readonly<{
    contribution: BabylonNativeSceneContributionV1;
    contributionHash: `sha256:${string}`;
  }> | undefined;
  const runtime = await BabylonWorldRuntime.create({
    worldRuntimeBootstrap: worldBootstrap,
    gameplayBootstrap: parseGameplayBootstrapV1(gameplayBootstrap),
    sceneSource: {
      kind: "babylon-native-scene",
      bootstrap: parseBabylonNativeSceneBootstrapV1(nativeBootstrap),
      module: creatorModule,
      assets: Object.freeze({
        async resolve() {
          throw new Error("CREATOR_STATIC_ASSET_NOT_LOCKED: use declared SDK subjects or generated geometry.");
        },
      }),
      budget: creatorConfig.admissionBudget ?? Object.freeze({
        maximumStaticColliderCount: 2048,
        maximumStaticColliderVertexCount: 500_000,
        maximumStaticColliderTriangleCount: 500_000,
      }),
    },
    runtimeSessionId: `creator-preview-${crypto.randomUUID()}`,
    canvas,
    autoStartRenderLoop: false,
    subjectAssetResolver,
    onInitializationStage(stage) { loading.textContent = `正在启动世界 · ${stage}`; },
    onNativeSceneAdmission(value) { admission = value; },
  });

  try {
    const gameplayPort = createBabylonGameplayWorldPortV1(runtime, CONTROLLER_ENTITY_ID);
    await gameplayPort.initialize();
    const bind = async (): Promise<void> => {
      const prepared = await gameplayPort.prepareGameplayTransition(
        possessionTransition(controlledEntityId, gameplayPort.snapshot().simulationTick),
      );
      prepared.commitPrepared();
    };
    await bind();

    let isDisposed = false;
    let isDisposing = false;
    let isLive = false;
    let liveGeneration = 0;
    let queue: Promise<void> = Promise.resolve();
    let frameRequest = 0;
    let lastFrameTime = 0;
    let accumulatedSeconds = 0;
    const pressedKeys = new Set<string>();
    const eventLifetime = new AbortController();
    let resizeObserver: ResizeObserver | undefined;

    function enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
      if (isDisposed || isDisposing) return Promise.reject(new Error("CREATOR_HARNESS_DISPOSED"));
      const result = queue.then(operation);
      // A rejected user command is observable but does not poison later cleanup.
      queue = result.then(() => undefined, () => undefined);
      return result;
    }

    function updateStatus(snapshot: BabylonRuntimeProjectionV1): void {
      const subject = snapshot.subjectStatesByEntityId[controlledEntityId];
      const coordinates = subject?.positionMetersXYZ.map((value) => value.toFixed(1)).join(" / ") ?? "—";
      status.textContent = `${isLive ? "探索中" : "已暂停"} · ${coordinates} · tick ${snapshot.tick}`;
      playButton.textContent = isLive ? "暂停" : "开始探索";
    }

    async function runTicks(rawInput: FixedInputV1): Promise<BabylonRuntimeProjectionV1> {
      const input = parseFixedInputV1(rawInput);
      if (input.ticks > 36_000) throw new RangeError("CREATOR_FIXED_INPUT_TICKS_EXCEEDED");
      for (let tick = 0; tick < input.ticks; tick += 1) {
        await gameplayPort.runFixedInputTick(
          { actions: input.actions, ...(input.axes === undefined ? {} : { axes: input.axes }), ticks: 1 },
          Object.freeze({
            simulationTick: gameplayPort.snapshot().simulationTick + 1,
            activeActionStatesById: Object.freeze({}),
          }),
        );
      }
      const snapshot = runtime.snapshot();
      updateStatus(snapshot);
      return snapshot;
    }

    function pause(): void {
      isLive = false;
      liveGeneration += 1;
      cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      accumulatedSeconds = 0;
      pressedKeys.clear();
    }

    function fail(error: unknown): void {
      pause();
      recordFailure(error);
    }

    async function liveFrame(timestamp: number, generation: number): Promise<void> {
      if (!isLive || isDisposed || isDisposing || generation !== liveGeneration) return;
      const elapsed = Math.min(0.1, Math.max(0, (timestamp - lastFrameTime) / 1000));
      lastFrameTime = timestamp;
      accumulatedSeconds += elapsed;
      const ticks = Math.min(5, Math.floor(accumulatedSeconds / FIXED_TIME_STEP_SECONDS));
      accumulatedSeconds -= ticks * FIXED_TIME_STEP_SECONDS;
      await enqueue(async () => {
        if (!isLive || generation !== liveGeneration) return;
        if (ticks > 0) await runTicks({ actions: semanticActions(pressedKeys), ticks });
        runtime.renderFrame();
      });
      if (isLive && !isDisposing && generation === liveGeneration) {
        frameRequest = requestAnimationFrame((next) => { void liveFrame(next, generation).catch(fail); });
      }
    }

    async function capture(input: CreatorCaptureRequestV1): Promise<CreatorCaptureResultV1> {
      const dimensions = creatorCaptureDimensionsV1(input);
      await runtime.renderFrameWhenReady();
      const result = (() => {
        if (input.view === "opening") {
          return runtime.captureArtifactView({
            kind: "opening-frame",
            ...dimensions,
            ...(input.entityIds === undefined ? {} : { projectedEntityIds: input.entityIds }),
          });
        }
        if (input.view === "top-down") {
          return runtime.captureArtifactView({
            kind: "top-down",
            ...dimensions,
            centerMetersXZ: creatorConfig.worldBounds.centerMetersXZ,
            sizeMetersXZ: creatorConfig.worldBounds.sizeMetersXZ,
            maximumHeightMeters: creatorConfig.worldBounds.heightRangeMeters[1],
          });
        }
        if (input.view !== "entity-triview" || input.entityIds === undefined || input.entityIds.length === 0) {
          throw new Error("CREATOR_CAPTURE_VIEW_INVALID: entity-triview requires entityIds.");
        }
        if (!/^#[a-f\d]{6}$/i.test(input.identityColor ?? "#D9DDE6")) {
          throw new Error("CREATOR_CAPTURE_IDENTITY_COLOR_INVALID");
        }
        return runtime.captureArtifactView({
          kind: "entity-triview",
          ...dimensions,
          entityIds: input.entityIds,
          identityColor: input.identityColor ?? "#D9DDE6",
          frontDirectionWorldXZ: creatorTriviewDirectionV1(input.azimuthRadians),
          renderStyle: "runtime-lit-review",
        });
      })();
      // The SDK restores camera, visibility, materials and canvas size after capture.
      runtime.renderFrame();
      return Object.freeze({
        dataUrl: result.dataUrl,
        widthPixels: result.widthPixels,
        heightPixels: result.heightPixels,
        projectedBoundsByEntityId: result.projectedBoundsByEntityId,
      });
    }

    let disposal: Promise<void> | undefined;
    const api: CreatorBrowserApiV1 = Object.freeze({
      ready: true as const,
      snapshot: () => runtime.snapshot(),
      runFixedInput: (input: FixedInputV1) => enqueue(() => runTicks(input)),
      reset: () => enqueue(async () => {
        pressedKeys.clear();
        runtime.reset();
        await bind();
        const snapshot = await runTicks({ actions: [], ticks: INITIAL_SETTLE_TICKS });
        await runtime.renderFrameWhenReady();
        return snapshot;
      }),
      adjustCamera: (input: CreatorCameraAdjustmentV1) => enqueue(() => {
        const snapshot = runtime.adjustCameraView({
          ...(input.yawRadiansDelta === undefined ? {} : { yawDeltaRadians: input.yawRadiansDelta }),
          ...(input.pitchRadiansDelta === undefined ? {} : { pitchDeltaRadians: input.pitchRadiansDelta }),
          ...(input.distanceMetersDelta === undefined ? {} : { zoomDeltaMeters: input.distanceMetersDelta }),
        });
        runtime.renderFrame();
        return snapshot;
      }),
      capture: (input: CreatorCaptureRequestV1) => enqueue(() => capture(input)),
      audit: () => {
        if (admission === undefined) throw new Error("CREATOR_ADMISSION_MISSING");
        return Object.freeze({
          kind: "experimental-native-creator-audit" as const,
          schemaVersion: 1 as const,
          sceneId: creatorConfig.sceneId,
          inputHash: creatorConfig.inputHash,
          contributionHash: admission.contributionHash,
          colliderIds: Object.freeze(admission.contribution.staticColliders.map(({ id }) => id)),
          spawnMarkerId: admission.contribution.spawnMarker.id,
          errors: Object.freeze([...errors]),
          isLive,
          isDisposed,
        });
      },
      startLive: () => enqueue(() => {
        if (isLive) return;
        isLive = true;
        const generation = ++liveGeneration;
        lastFrameTime = performance.now();
        accumulatedSeconds = 0;
        updateStatus(runtime.snapshot());
        canvas.focus();
        frameRequest = requestAnimationFrame((next) => { void liveFrame(next, generation).catch(fail); });
      }),
      stopLive: async () => {
        pause();
        await enqueue(() => updateStatus(runtime.snapshot()));
      },
      dispose: () => {
        if (disposal !== undefined) return disposal;
        pause();
        isDisposing = true;
        eventLifetime.abort();
        resizeObserver?.disconnect();
        disposal = queue.then(async () => {
          try { await gameplayPort.dispose(); }
          finally {
            isDisposed = true;
            delete window.__WORLDKIT_CREATOR__;
            setStatus("disposed");
          }
        });
        return disposal;
      },
    });

    await runTicks({ actions: [], ticks: INITIAL_SETTLE_TICKS });
    runtime.resize();
    await runtime.renderFrameWhenReady();
    window.__WORLDKIT_CREATOR__ = api;
    setStatus("ready");
    loading.hidden = true;
    playButton.disabled = false;
    resetButton.disabled = false;
    updateStatus(runtime.snapshot());

    const eventOptions = { signal: eventLifetime.signal };
    const controlledKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "Space"]);
    window.addEventListener("keydown", (event) => {
      if (controlledKeys.has(event.code)) {
        event.preventDefault();
        if (isLive) pressedKeys.add(event.code);
      }
      if (event.code === "KeyR" && !event.repeat) {
        event.preventDefault();
        void api.reset().catch(fail);
      }
    }, eventOptions);
    window.addEventListener("keyup", (event) => { pressedKeys.delete(event.code); }, eventOptions);
    window.addEventListener("blur", () => pressedKeys.clear(), eventOptions);
    window.addEventListener("error", (event) => fail(event.error ?? event.message), eventOptions);
    window.addEventListener("unhandledrejection", (event) => fail(event.reason), eventOptions);
    let pointerId: number | undefined;
    let lastPointerX = 0;
    let lastPointerY = 0;
    canvas.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.focus();
    }, eventOptions);
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      const deltaX = event.clientX - lastPointerX;
      const deltaY = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      void api.adjustCamera({ yawRadiansDelta: -deltaX * 0.0045, pitchRadiansDelta: -deltaY * 0.0035 }).catch(fail);
    }, eventOptions);
    const releasePointer = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener("pointerup", releasePointer, eventOptions);
    canvas.addEventListener("pointercancel", releasePointer, eventOptions);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault(), eventOptions);
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      void api.adjustCamera({ distanceMetersDelta: Math.max(-1.2, Math.min(1.2, event.deltaY * 0.004)) }).catch(fail);
    }, { ...eventOptions, passive: false });
    playButton.addEventListener("click", () => {
      void (isLive ? api.stopLive() : api.startLive()).catch(fail);
    }, eventOptions);
    resetButton.addEventListener("click", () => { void api.reset().catch(fail); }, eventOptions);
    resizeObserver = new ResizeObserver(() => {
      void enqueue(() => { runtime.resize(); runtime.renderFrame(); }).catch(fail);
    });
    resizeObserver.observe(canvas);
    window.addEventListener("beforeunload", () => { void api.dispose().catch(recordFailure); }, {
      ...eventOptions,
      once: true,
    });
    if (new URLSearchParams(location.search).get("play") === "1") {
      await api.startLive();
    }
  } catch (error) {
    try { await runtime.dispose(); } catch { /* Keep the startup error primary. */ }
    throw error;
  }
}

void start().catch(recordFailure);
