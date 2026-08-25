import type {
  ApplyCameraPreviewRequestV1,
  ApplySubjectPresetTuningRequestV1,
  CameraPreviewStateV1,
  CameraViewInputV1,
  ControlCaptureCapabilitiesV1,
  ControlCaptureRequestV1,
  ExecutionPlanV5,
  FixedInputV1,
  RenderReadyReceiptV1,
  RuntimeControlCaptureFrameV1,
  RuntimeCaptureTargetV1,
  SemanticInputActionV1,
  RuntimeActivityReceiptV1,
  RuntimeActivityRequestV1,
  WorldRuntimeSnapshotV4,
  SubjectPresetTuningReceiptV1,
  WorldkitBrowserDiagnosticV1,
  WhiteboxTriviewCaptureV1,
} from "@whitebox-world/runtime-contracts";
import { validateRuntimeCaptureTargetsV1 } from "@whitebox-world/runtime-contracts";
import type {
  GameplayCommandReceiptV1,
  GameplayCommandV1,
  GameplayEventV1,
  GameplayInspectionSnapshotV1,
  WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import {
  BabylonWorldRuntime,
  FIXED_TIME_STEP_SECONDS,
  type BabylonRuntimeProjectionV1,
  type BabylonWorldRuntimeOptions,
} from "@whitebox-world/runtime-babylon";
import type { RuntimeWorldConfigurationV1 } from "@whitebox-world/runtime-host";
import { isNil } from "lodash-es";

import type {
  FeatureInspection,
  FixedInputStep,
  InputAction,
  PlaygroundWorldMetadataV1,
  PlaygroundWorldAdapter,
  OpeningCompositionReport,
  PlanningViewKind,
  WorldSnapshot,
} from "./playground-world";
import {
  createGameplayBabylonRuntimeCoordinatorV1,
  type GameplayBabylonRuntimeCoordinatorV1,
} from "./gameplay-babylon-runtime-coordinator";

export interface BabylonWorldAdapterCreateOptionsV1 extends Pick<
  BabylonWorldRuntimeOptions,
  | "subjectAssetResolver"
  | "subjectAssetCacheOptions"
  | "onInitializationStage"
> {
  readonly playgroundMetadata?: PlaygroundWorldMetadataV1;
}

const INPUT_ACTION_MAP: Readonly<Partial<Record<InputAction, SemanticInputActionV1>>> = {
  forward: "move-forward",
  backward: "move-backward",
  left: "move-left",
  right: "move-right",
  run: "run",
  jump: "jump",
};

const KEY_ACTION_MAP: Readonly<Record<string, readonly SemanticInputActionV1[]>> = {
  KeyW: ["move-forward"],
  KeyS: ["move-backward"],
  KeyA: ["move-left"],
  KeyD: ["move-right"],
  ControlLeft: ["brake"],
  ControlRight: ["brake"],
  AltLeft: ["handbrake"],
  AltRight: ["handbrake"],
  KeyE: ["primary-action"],
  KeyQ: ["secondary-action"],
  KeyF: ["aim"],
  KeyR: ["camera-recenter"],
  KeyC: ["camera-look-back"],
  KeyV: ["camera-shoulder-swap"],
};

type CameraInputAction = Extract<
  InputAction,
  "cameraLeft" | "cameraRight" | "cameraUp" | "cameraDown"
>;

const CAMERA_KEY_ACTION_MAP: Readonly<Partial<Record<string, CameraInputAction>>> = {
  ArrowLeft: "cameraLeft",
  ArrowRight: "cameraRight",
  ArrowUp: "cameraUp",
  ArrowDown: "cameraDown",
};

const CAMERA_YAW_RADIANS_PER_TICK = 0.025;
const CAMERA_PITCH_RADIANS_PER_TICK = 0.015;
const MAXIMUM_FIXED_TICKS_PER_DISPLAY_FRAME = 5;
const CONTEXTUAL_KEY_CODES = new Set(["ShiftLeft", "ShiftRight", "Space"]);

const SEMANTIC_INPUT_ACTION_ORDER: readonly SemanticInputActionV1[] = [
  "move-forward",
  "move-backward",
  "move-left",
  "move-right",
  "jump",
  "run",
  "boost",
  "brake",
  "handbrake",
  "primary-action",
  "secondary-action",
  "aim",
  "camera-recenter",
  "camera-look-back",
  "camera-shoulder-swap",
];

export function mapPlaygroundInputActions(
  actions: readonly InputAction[],
): readonly SemanticInputActionV1[] {
  const mapped = new Set<SemanticInputActionV1>();
  for (const action of actions) {
    const semanticAction = INPUT_ACTION_MAP[action];
    if (semanticAction !== undefined) mapped.add(semanticAction);
  }
  return SEMANTIC_INPUT_ACTION_ORDER.filter((action) => mapped.has(action));
}

export class PhysicalKeyboardActionTracker {
  readonly #pressedCodes = new Set<string>();

  press(code: string): boolean {
    if (KEY_ACTION_MAP[code] === undefined && !CONTEXTUAL_KEY_CODES.has(code)) return false;
    this.#pressedCodes.add(code);
    return true;
  }

  release(code: string): boolean {
    if (KEY_ACTION_MAP[code] === undefined && !CONTEXTUAL_KEY_CODES.has(code)) return false;
    this.#pressedCodes.delete(code);
    return true;
  }

  clear(): void {
    this.#pressedCodes.clear();
  }

  actions(activeMotionKernelRef = "worldkit://motion-kernel/free-ground@1"):
    readonly SemanticInputActionV1[] {
    const active = new Set<SemanticInputActionV1>();
    for (const code of this.#pressedCodes) {
      for (const action of KEY_ACTION_MAP[code] ?? []) active.add(action);
      if (code === "ShiftLeft" || code === "ShiftRight") {
        active.add(
          activeMotionKernelRef.endsWith("/free-ground@1") ||
              activeMotionKernelRef.endsWith("/forward-steer@1")
            ? "run"
            : "boost",
        );
      }
      if (code === "Space") {
        if (
          activeMotionKernelRef.endsWith("/free-ground@1") ||
          activeMotionKernelRef.endsWith("/forward-steer@1")
        ) active.add("jump");
        else if (activeMotionKernelRef.endsWith("/unpowered-glide@1")) {
          active.add("primary-action");
        } else active.add("brake");
      }
    }
    return SEMANTIC_INPUT_ACTION_ORDER.filter((action) => active.has(action));
  }
}

export function activeActionForControlledSubject(
  snapshot: BabylonRuntimeProjectionV1,
): WorldSnapshot["player"]["action"] {
  if (snapshot.possessionTarget.mode === "unbound") {
    throw new Error("WORLDKIT_RUNTIME_CONTROL_UNBOUND");
  }
  const { controlledEntityId } = snapshot.possessionTarget;
  const controlledSubject = snapshot.subjectStatesByEntityId[controlledEntityId];
  if (controlledSubject === undefined) {
    throw new Error(
      `WORLDKIT_RUNTIME_SNAPSHOT_CONTROL_TARGET_NOT_FOUND: ${controlledEntityId}`,
    );
  }
  return controlledSubject.activeActionId;
}

export function featureInspections(plan: ExecutionPlanV5): readonly FeatureInspection[] {
  return [
    {
      id: plan.terrain.entityId,
      type: "runtime.terrain-heightfield",
      version: 1,
      seed: plan.seed,
      status: "ready",
      parameters: {
        centerMetersXZ: plan.terrain.centerMetersXZ,
        sizeMetersXZ: plan.terrain.sizeMetersXZ,
        resolutionCellsXZ: plan.terrain.resolutionCellsXZ,
        heightSamplesHash: plan.terrain.heightSamplesHash,
      },
      resources: [
        { id: `${plan.terrain.entityId}.mesh`, kind: "mesh", vertices: plan.terrain.heightSamplesMeters.length },
        { id: `${plan.terrain.entityId}.heightfield`, kind: "collider" },
      ],
      diagnostics: [],
    },
    ...plan.waters.map<FeatureInspection>((water) => ({
      id: water.entityId,
      type: "runtime.water-surface",
      version: 1,
      status: "ready",
      parameters: {
        boundary: water.boundary,
        waterLevelMeters: water.waterLevelMeters,
        traversalMode: water.traversalMode,
      },
      resources: [{ id: `${water.entityId}.surface`, kind: "surface" }],
      diagnostics: [],
    })),
    ...plan.objects.map<FeatureInspection>((object) => ({
      id: object.entityId,
      type: `runtime.primitive-${object.primitive.kind}`,
      version: 1,
      status: "ready",
      parameters: {
        prototypeId: object.prototypeId,
        primitive: object.primitive,
        transform: object.transform,
      },
      resources: [
        { id: `${object.entityId}.mesh`, kind: "mesh" },
        ...(object.collisionEnabled ? [{ id: `${object.entityId}.collider`, kind: "collider" as const }] : []),
      ],
      diagnostics: [],
    })),
    ...plan.subjects.map<FeatureInspection>((subject) => ({
      id: subject.entityId,
      type: `runtime.subject-${subject.bodyTopology}`,
      version: 1,
      status: "ready",
      parameters: {
        subjectDefinitionRef: subject.subjectDefinitionRef,
        subjectDefinitionHash: subject.subjectDefinitionHash,
        bodyTopology: subject.bodyTopology,
        semanticClassId: subject.semanticClassId,
        collider: subject.collider,
        locomotion: subject.locomotion,
      },
      resources: [
        ...subject.visualParts.map((part) => ({
          id: `${subject.entityId}.${part.id}`,
          kind: "mesh" as const,
        })),
        { id: `${subject.entityId}.character-controller`, kind: "collider" },
      ],
      diagnostics: [],
    })),
    {
      id: plan.camera.cameraEntityId,
      type: "runtime.camera-third-person",
      version: 1,
      status: "ready",
      parameters: { ...plan.camera },
      resources: [{ id: `${plan.camera.cameraEntityId}.semantic`, kind: "semantic" }],
      diagnostics: [],
    },
  ];
}

export class BabylonWorldAdapter implements PlaygroundWorldAdapter {
  readonly name: string;

  private readonly listeners = new Set<(snapshot: WorldSnapshot) => void>();
  private readonly keyboardInput = new PhysicalKeyboardActionTracker();
  private readonly cameraInput = new Set<CameraInputAction>();
  private readonly inspections: readonly FeatureInspection[];
  private readonly resizeObserver: ResizeObserver;
  private animationFrameId: number | null = null;
  private frame = 0;
  private paused = false;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;
  private animationPending = false;
  private previousAnimationTimestampMilliseconds: number | null = null;
  private fixedStepAccumulatorSeconds = 0;
  private displayFramesPerSecond = 0;
  private frameLoopDiagnostic: WorldkitBrowserDiagnosticV1 | undefined;
  private captureReservationReceiptId: string | undefined;
  private captureActivitySequence = 0;
  private activeCameraPointerId: number | null = null;
  private lastCameraPointerPosition: readonly [number, number] = [0, 0];
  private mountedContainer: HTMLElement | undefined;
  private compositionCache:
    | Readonly<{ dataUrl: string; report: OpeningCompositionReport }>
    | undefined;
  private visualCaptureTargets: readonly RuntimeCaptureTargetV1[] = [];

  private constructor(
    private readonly executionPlan: ExecutionPlanV5,
    private readonly coordinator: GameplayBabylonRuntimeCoordinatorV1,
    private readonly playgroundMetadata?: PlaygroundWorldMetadataV1,
  ) {
    this.name = `babylon-havok/${executionPlan.id}`;
    this.inspections = structuredClone(
      playgroundMetadata?.featureInspections ?? featureInspections(executionPlan),
    );
    this.resizeObserver = new ResizeObserver(() => this.activeRuntime().resize());
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    this.attachCanvas(this.canvas);
  }

  get canvas(): HTMLCanvasElement {
    return this.coordinator.activeCanvas();
  }

  static async create(
    runtimeWorldConfiguration: RuntimeWorldConfigurationV1,
    options: BabylonWorldAdapterCreateOptionsV1 = {},
  ): Promise<BabylonWorldAdapter> {
    const coordinator = await createGameplayBabylonRuntimeCoordinatorV1({
      runtimeSessionId: crypto.randomUUID(),
      initialWorldConfiguration: runtimeWorldConfiguration,
      ...(options.subjectAssetResolver === undefined
        ? {}
        : { subjectAssetResolver: options.subjectAssetResolver }),
      ...(options.subjectAssetCacheOptions === undefined
        ? {}
        : { subjectAssetCacheOptions: options.subjectAssetCacheOptions }),
      ...(options.onInitializationStage === undefined
        ? {}
        : {
            onInitializationStage: (_worldSessionId, stage) =>
              options.onInitializationStage?.(stage),
          }),
    });
    try {
      return new BabylonWorldAdapter(
        runtimeWorldConfiguration.executionPlan,
        coordinator,
        options.playgroundMetadata,
      );
    } catch (error) {
      try {
        await coordinator.dispose();
      } catch {
        // Preserve the primary Adapter construction failure.
      }
      throw error;
    }
  }

  mount(container: HTMLElement): void {
    this.mountedContainer = container;
    container.append(this.canvas);
    this.resizeObserver.observe(container);
    this.activeRuntime().resize();
    this.canvas.focus();
    this.scheduleAnimationFrame();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.coordinator.setPaused(paused);
    this.resetAnimationClock();
    this.emit();
  }

  isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    void this.resetRuntime().catch(() => {
      this.paused = true;
      this.coordinator.setPaused(true);
      this.frameLoopDiagnostic = {
        severity: "error",
        code: "WORLDKIT_RUNTIME_RESET_FAILED",
        instancePath: "",
        message: "The runtime reset failed and the current World was preserved.",
      };
      this.emit();
    });
  }

  render(): void {
    if (this.captureReservationReceiptId !== undefined) return;
    this.activeRuntime().renderFrame();
    this.frame += 1;
  }

  async runFixedInput(steps: readonly FixedInputStep[]): Promise<WorldSnapshot> {
    this.captureReservationReceiptId = undefined;
    const wasPaused = this.paused;
    this.paused = true;
    for (const step of steps) {
      const ticks = Math.max(0, Math.floor(step.ticks));
      this.applyCameraActions(step.actions, ticks);
      await this.coordinator.runFixedInput({
        actions: mapPlaygroundInputActions(step.actions),
        ticks,
      });
    }
    this.paused = wasPaused;
    this.resetAnimationClock();
    this.render();
    this.emit();
    return this.snapshot();
  }

  async runWorldkitFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV4> {
    this.captureReservationReceiptId = undefined;
    const wasPaused = this.paused;
    let snapshot: WorldRuntimeSnapshotV4;
    try {
      this.paused = true;
      this.coordinator.setPaused(true);
      snapshot = this.coordinator.snapshot();
      for (const step of steps) snapshot = await this.coordinator.runFixedInput(step);
    } finally {
      this.paused = wasPaused;
      this.coordinator.setPaused(wasPaused);
    }
    this.resetAnimationClock();
    this.render();
    this.emit();
    return snapshot;
  }

  getControlCaptureCapabilities(): ControlCaptureCapabilitiesV1 {
    return this.activeRuntime().getControlCaptureCapabilities();
  }

  async waitForSimulationTick(
    expectedSimulationTick: number,
  ): Promise<WorldRuntimeSnapshotV4> {
    if (!Number.isSafeInteger(expectedSimulationTick) || expectedSimulationTick < 0) {
      throw new RangeError("Expected Simulation Tick must be a non-negative safe integer.");
    }
    const snapshot = this.coordinator.snapshot();
    if (snapshot.world.simulationTick !== expectedSimulationTick) {
      throw new Error("CONTROL_CAPTURE_SIMULATION_TICK_MISMATCH");
    }
    return snapshot;
  }

  async waitForRenderReady(
    expectedSimulationTick: number,
  ): Promise<RenderReadyReceiptV1> {
    const receipt = this.activeRuntime().waitForRenderReady(expectedSimulationTick);
    this.captureReservationReceiptId = receipt.id;
    return receipt;
  }

  async captureControlFrame(
    request: ControlCaptureRequestV1,
  ): Promise<RuntimeControlCaptureFrameV1> {
    if (request.renderReadyReceiptId !== this.captureReservationReceiptId) {
      throw new Error("CONTROL_CAPTURE_RENDER_READY_REQUIRED");
    }
    const wasPaused = this.paused;
    this.captureActivitySequence += 1;
    const activityRequest: RuntimeActivityRequestV1 = Object.freeze({
      schemaVersion: 1,
      id: `control-capture.${this.runtimeSnapshot().worldSessionId}.${this.captureActivitySequence}`,
      activityKind: "control-capture",
      expectedWorldSessionId: this.runtimeSnapshot().worldSessionId,
    });
    const acquisition = this.acquireRuntimeActivityRuntime(activityRequest);
    if (acquisition.status !== "active") {
      throw new Error(
        acquisition.status === "rejected"
          ? acquisition.diagnostic.code
          : "WORLDKIT_RUNTIME_ACTIVITY_NOT_ACTIVE",
      );
    }
    this.paused = true;
    this.coordinator.setPaused(true);
    let primaryError: unknown;
    try {
      const frame = await this.activeRuntime().captureControlFrame(request);
      return Object.freeze({ ...frame, snapshot: this.coordinator.snapshot() });
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      this.captureReservationReceiptId = undefined;
      this.paused = wasPaused;
      this.coordinator.setPaused(wasPaused);
      this.resetAnimationClock();
      const release = this.releaseRuntimeActivityRuntime(activityRequest);
      if (primaryError === undefined && release.status === "rejected") {
        throw new Error(release.diagnostic.code);
      }
    }
  }

  requestCameraProfileRuntime(profileRef: string): WorldRuntimeSnapshotV4 {
    this.captureReservationReceiptId = undefined;
    this.activeRuntime().requestCameraProfile(profileRef);
    this.render();
    this.emit();
    return this.coordinator.snapshot();
  }

  resetCameraProfileRuntime(): WorldRuntimeSnapshotV4 {
    this.captureReservationReceiptId = undefined;
    this.activeRuntime().resetCameraProfile();
    this.render();
    this.emit();
    return this.coordinator.snapshot();
  }

  adjustCameraViewRuntime(input: CameraViewInputV1): WorldRuntimeSnapshotV4 {
    this.captureReservationReceiptId = undefined;
    this.activeRuntime().adjustCameraView(input);
    this.render();
    this.emit();
    return this.coordinator.snapshot();
  }

  resetCameraViewRuntime(): WorldRuntimeSnapshotV4 {
    this.captureReservationReceiptId = undefined;
    this.activeRuntime().resetCameraView();
    this.render();
    this.emit();
    return this.coordinator.snapshot();
  }

  getCameraPreviewStateRuntime(): CameraPreviewStateV1 {
    return this.activeRuntime().getCameraPreviewState();
  }

  applyCameraPreviewRuntime(request: ApplyCameraPreviewRequestV1): CameraPreviewStateV1 {
    this.captureReservationReceiptId = undefined;
    const preview = this.activeRuntime().applyCameraPreview(request);
    this.render();
    this.emit();
    return preview;
  }

  applySubjectPresetTuningRuntime(
    request: ApplySubjectPresetTuningRequestV1,
  ): SubjectPresetTuningReceiptV1 {
    this.captureReservationReceiptId = undefined;
    const receipt = this.activeRuntime().applySubjectPresetTuning(request);
    this.render();
    this.emit();
    return Object.freeze({ ...receipt, snapshot: this.coordinator.snapshot() });
  }
  runSubjectHarness(subjectEntityId: string) {
    return this.activeRuntime().runHarness(subjectEntityId);
  }

  async setMotionProfileRuntime(
    subjectEntityId: string,
    motionProfileRef: string,
  ): Promise<WorldRuntimeSnapshotV4> {
    this.captureReservationReceiptId = undefined;
    if (!this.activeRuntime().requestMotionProfile(subjectEntityId, motionProfileRef)) {
      throw new Error("WORLDKIT_MOTION_PROFILE_INCOMPATIBLE");
    }
    const snapshot = await this.coordinator.runFixedInput({ actions: [], ticks: 1 });
    this.render();
    this.emit();
    return snapshot;
  }

  runtimeDiagnostics(): readonly WorldkitBrowserDiagnosticV1[] {
    const diagnostics: WorldkitBrowserDiagnosticV1[] =
      this.executionPlan.layout.layoutAssertions.map((assertion, index) => ({
      severity: "info",
      code: "WORLDKIT_LAYOUT_ASSERTION_SATISFIED",
      instancePath: `/layout/layoutAssertions/${index}`,
      message: "Frozen layout assertion passed runtime validation.",
      details: {
        layoutSolveReportHash: this.executionPlan.layout.layoutSolveReportHash,
        constraintId: assertion.constraintId,
        kind: assertion.kind,
        evidenceEntityIds: [...assertion.evidenceEntityIds],
        measurements: structuredClone(assertion.measurements),
        tolerances: structuredClone(assertion.tolerances),
      },
      }));
    return this.frameLoopDiagnostic === undefined
      ? diagnostics
      : [...diagnostics, this.frameLoopDiagnostic];
  }

  runtimeSnapshot(): WorldRuntimeSnapshotV4 {
    return this.coordinator.snapshot();
  }

  executeGameplayCommandRuntime(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1> {
    return this.coordinator.executeGameplayCommand(command);
  }

  gameplayEventsAfterRuntime(
    afterEventSequence: number,
    maximumEventCount: number,
  ): readonly GameplayEventV1[] {
    return this.coordinator.eventsAfter(afterEventSequence, maximumEventCount);
  }

  gameplayInspectionSnapshotRuntime(): GameplayInspectionSnapshotV1 {
    return this.coordinator.getGameplayInspectionSnapshot();
  }

  worldStateSnapshotRuntime(
    worldStateRef: string,
  ): WorldStateSnapshotV1 | undefined {
    return this.coordinator.getWorldStateSnapshot(worldStateRef);
  }

  acquireRuntimeActivityRuntime(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1 {
    return this.coordinator.acquireRuntimeActivity(request);
  }

  releaseRuntimeActivityRuntime(
    request: RuntimeActivityRequestV1,
  ): RuntimeActivityReceiptV1 {
    return this.coordinator.releaseRuntimeActivity(request);
  }

  async resetRuntime(): Promise<WorldRuntimeSnapshotV4> {
    this.captureReservationReceiptId = undefined;
    this.keyboardInput.clear();
    this.cameraInput.clear();
    this.activeCameraPointerId = null;
    this.frameLoopDiagnostic = undefined;
    this.resetAnimationClock();
    const previousCanvas = this.canvas;
    const snapshot = await this.coordinator.resetWithInitialControlBinding();
    const nextCanvas = this.canvas;
    if (previousCanvas !== nextCanvas) {
      this.detachCanvas(previousCanvas);
      this.attachCanvas(nextCanvas);
      if (this.mountedContainer !== undefined) {
        previousCanvas.replaceWith(nextCanvas);
        this.activeRuntime().resize();
        nextCanvas.focus();
      }
    }
    this.emit();
    return snapshot;
  }

  captureScreenshot(): string {
    this.render();
    return this.canvas.toDataURL("image/png");
  }

  configureVisualCaptureTargets(
    targets: readonly RuntimeCaptureTargetV1[],
  ): readonly RuntimeCaptureTargetV1[] {
    const diagnostics = validateRuntimeCaptureTargetsV1(targets);
    if (diagnostics.length > 0) {
      throw new Error(`WORLDKIT_CAPTURE_TARGETS_INVALID: ${diagnostics.join(" ")}`);
    }
    const capturableEntityIds = new Set([
      ...this.executionPlan.subjects.map(({ entityId }) => entityId),
      ...this.executionPlan.objects.map(({ entityId }) => entityId),
    ]);
    for (const target of targets) {
      for (const runtimeEntityId of target.runtimeEntityIds) {
        if (!capturableEntityIds.has(runtimeEntityId)) {
          throw new Error(`WORLDKIT_CAPTURE_TARGET_NOT_FOUND: ${runtimeEntityId}`);
        }
      }
    }
    this.visualCaptureTargets = targets.map((target) => Object.freeze({
      ...target,
      runtimeEntityIds: Object.freeze([...target.runtimeEntityIds]),
    }));
    return this.listCaptureTargets();
  }

  listCaptureTargets(): readonly RuntimeCaptureTargetV1[] {
    return structuredClone(this.visualCaptureTargets);
  }

  captureRuntimeWhiteboxTriview(targetId: string): WhiteboxTriviewCaptureV1 {
    const target = this.visualCaptureTargets.find((candidate) => candidate.id === targetId);
    if (target === undefined) {
      throw new Error(`WORLDKIT_CAPTURE_TARGET_NOT_FOUND: ${targetId}`);
    }
    return {
      kind: "worldkit-whitebox-triview-capture",
      schemaVersion: 1,
      targetId,
      runtimeEntityIds: [...target.runtimeEntityIds],
      views: ["front", "right", "back"],
      imageDataUrl: this.activeRuntime().captureArtifactView({
        kind: "entity-triview",
        widthPixels: Math.max(3, this.canvas.width),
        heightPixels: Math.max(1, this.canvas.height),
        entityIds: target.runtimeEntityIds,
        identityColor: target.identityColor,
      }).dataUrl,
    };
  }

  captureCompositionMask(): string {
    return this.captureCompositionAnalysis()?.dataUrl ?? "";
  }

  analyzeOpeningComposition(): OpeningCompositionReport | null {
    return this.captureCompositionAnalysis()?.report ?? null;
  }

  async exportOpeningFrame(): Promise<string> {
    throw new Error("Opening-frame artifact export is unavailable through this adapter method.");
  }

  captureOpeningFrameDataUrl(): string {
    const guide = this.playgroundMetadata?.worldSpec?.entry.composition.guide;
    const aspectRatio = guide?.aspectRatio ?? 16 / 9;
    return this.activeRuntime().captureArtifactView({
      kind: "opening-frame",
      widthPixels: 1_280,
      heightPixels: Math.round(1_280 / aspectRatio),
      cameraPose: this.artifactOpeningCameraPose(),
    }).dataUrl;
  }

  getWorldSpec(): NonNullable<PlaygroundWorldMetadataV1["worldSpec"]> | null {
    return isNil(this.playgroundMetadata?.worldSpec)
      ? null
      : structuredClone(this.playgroundMetadata.worldSpec);
  }

  getPlanArtifacts(): NonNullable<PlaygroundWorldMetadataV1["planArtifacts"]> | null {
    return isNil(this.playgroundMetadata?.planArtifacts)
      ? null
      : structuredClone(this.playgroundMetadata.planArtifacts);
  }

  capturePlanningView(kind: PlanningViewKind): string {
    const worldSpec = this.playgroundMetadata?.worldSpec;
    const planArtifacts = this.playgroundMetadata?.planArtifacts;
    if (worldSpec === undefined || planArtifacts === undefined) {
      throw new Error("Planning artifacts are unavailable.");
    }
    if (kind === "opening-shot") {
      this.resetCameraViewRuntime();
      return this.captureScreenshot();
    }
    if (kind === "height-slope-plan") {
      const artifact = planArtifacts.heightSlope;
      const canvas = document.createElement("canvas");
      canvas.width = artifact.grid.columns;
      canvas.height = artifact.grid.rows;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("2D canvas is unavailable.");
      const image = context.createImageData(canvas.width, canvas.height);
      const heightRange = Math.max(
        1e-6,
        artifact.stats.maximumHeight - artifact.stats.minimumHeight,
      );
      for (let index = 0; index < artifact.grid.heights.length; index += 1) {
        const height = artifact.grid.heights[index];
        const slopeDegrees = artifact.grid.slopesDegrees[index];
        const offset = index * 4;
        if (isNil(height) || isNil(slopeDegrees)) {
          image.data.set([20, 24, 28, 255], offset);
          continue;
        }
        const elevation = (height - artifact.stats.minimumHeight) / heightRange;
        const brightness = 0.65 + elevation * 0.35;
        const base = slopeDegrees <= 35
          ? [66, 145, 82]
          : slopeDegrees <= 42
            ? [222, 174, 61]
            : [204, 68, 62];
        image.data[offset] = Math.round((base[0] ?? 0) * brightness);
        image.data[offset + 1] = Math.round((base[1] ?? 0) * brightness);
        image.data[offset + 2] = Math.round((base[2] ?? 0) * brightness);
        image.data[offset + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL("image/png");
    }
    return this.activeRuntime().captureArtifactView({
      kind: "top-down",
      widthPixels: Math.max(1, this.canvas.width),
      heightPixels: Math.max(1, this.canvas.height),
      centerMetersXZ: worldSpec.bounds.center,
      sizeMetersXZ: worldSpec.bounds.size,
      maximumHeightMeters: worldSpec.bounds.heightRange[1],
    }).dataUrl;
  }

  getVisualPrototypes(): ReturnType<PlaygroundWorldAdapter["getVisualPrototypes"]> {
    return isNil(this.playgroundMetadata?.worldSpec)
      ? []
      : structuredClone(this.playgroundMetadata.worldSpec.entityCatalog.prototypes);
  }

  captureWhiteboxTriview(prototypeId: string): string {
    if (this.visualCaptureTargets.some(({ id }) => id === prototypeId)) {
      return this.captureRuntimeWhiteboxTriview(prototypeId).imageDataUrl;
    }
    const worldSpec = this.playgroundMetadata?.worldSpec;
    if (worldSpec === undefined) throw new Error("WorldSpec is unavailable.");
    const prototype = worldSpec.entityCatalog.prototypes.find(
      (candidate) => candidate.id === prototypeId,
    );
    if (prototype === undefined) throw new Error(`Unknown visual prototype ${prototypeId}.`);
    const instance = worldSpec.entityCatalog.instances.find(
      (candidate) => candidate.prototypeId === prototypeId,
    );
    if (instance === undefined) throw new Error(`Prototype ${prototypeId} has no bound instance.`);
    return this.activeRuntime().captureArtifactView({
      kind: "entity-triview",
      widthPixels: Math.max(3, this.canvas.width),
      heightPixels: Math.max(1, this.canvas.height),
      entityIds: this.executionEntityIdsForBinding(
        instance.binding.kind,
        instance.binding.id,
      ),
      identityColor: prototype.instanceColor,
    }).dataUrl;
  }

  async exportWhiteboxTriviews(): Promise<readonly string[]> {
    const outputPaths: string[] = [];
    for (const target of this.visualCaptureTargets) {
      const capture = this.captureRuntimeWhiteboxTriview(target.id);
      const response = await fetch("/__whitebox/write-triview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sceneId: this.executionPlan.id,
          prototypeId: target.id,
          dataUrl: capture.imageDataUrl,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to export ${target.id}: ${await response.text()}`);
      }
      const payload = await response.json() as { path: string };
      outputPaths.push(payload.path);
    }
    return outputPaths;
  }

  private captureCompositionAnalysis():
    | Readonly<{ dataUrl: string; report: OpeningCompositionReport }>
    | null {
    const worldSpec = this.playgroundMetadata?.worldSpec;
    const guide = worldSpec?.entry.composition.guide;
    if (worldSpec === undefined || guide === undefined) return null;
    if (this.compositionCache !== undefined) return this.compositionCache;
    const colorByEntityId: Record<string, string> = {};
    for (const region of guide.regions) {
      for (const instance of worldSpec.entityCatalog.instances) {
        if (region.semantic.includes(instance.binding.id)) {
          for (const entityId of this.executionEntityIdsForBinding(
            instance.binding.kind,
            instance.binding.id,
          )) colorByEntityId[entityId] = region.color;
        }
      }
      if (region.semantic.includes("terrain")) colorByEntityId.terrain = region.color;
      if (/(water|bay|sea|lake)/.test(region.semantic)) {
        for (const feature of this.executionPlan.waters) {
          colorByEntityId[feature.entityId] = region.color;
        }
      }
    }
    const skyRegion = guide.regions.find((region) => region.semantic.includes("sky"));
    this.resetCameraViewRuntime();
    const capture = this.activeRuntime().captureArtifactView({
      kind: "composition-mask",
      widthPixels: guide.resolution[0],
      heightPixels: guide.resolution[1],
      backgroundColor: skyRegion?.color ?? "#CFD5D5",
      colorByEntityId,
      projectedEntityIds: guide.anchors.flatMap((anchor) =>
        this.executionEntityIdsForBinding(anchor.binding.kind, anchor.binding.id)
      ),
      cameraPose: this.artifactOpeningCameraPose(),
    });
    const parseColor = (value: string): readonly [number, number, number] => {
      const hex = Number.parseInt(value.slice(1), 16);
      return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    };
    const insidePolygon = (
      point: readonly [number, number],
      polygon: readonly (readonly [number, number])[],
    ): boolean => {
      let inside = false;
      for (
        let current = 0, previous = polygon.length - 1;
        current < polygon.length;
        previous = current, current += 1
      ) {
        const a = polygon[current]!;
        const b = polygon[previous]!;
        if (
          (a[1] > point[1]) !== (b[1] > point[1]) &&
          point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
        ) inside = !inside;
      }
      return inside;
    };
    const regions = guide.regions.map((region) => {
      const color = parseColor(region.color);
      let intersection = 0;
      let union = 0;
      for (let y = 0; y < capture.heightPixels; y += 1) {
        for (let x = 0; x < capture.widthPixels; x += 1) {
          const offset = (y * capture.widthPixels + x) * 4;
          const desired = insidePolygon(
            [(x + 0.5) / capture.widthPixels, (y + 0.5) / capture.heightPixels],
            region.polygon,
          );
          const observed = Math.hypot(
            (capture.pixelsRgba[offset] ?? 0) - color[0],
            (capture.pixelsRgba[offset + 1] ?? 0) - color[1],
            (capture.pixelsRgba[offset + 2] ?? 0) - color[2],
          ) <= 38;
          if (desired && observed) intersection += 1;
          if (desired || observed) union += 1;
        }
      }
      const iou = union === 0 ? 0 : intersection / union;
      return {
        id: region.id,
        iou,
        minimumIou: region.minimumIou,
        pass: iou >= region.minimumIou,
      };
    });
    const anchors = guide.anchors.map((anchor) => {
      const projected = this.executionEntityIdsForBinding(
        anchor.binding.kind,
        anchor.binding.id,
      ).flatMap((entityId) => {
        const bounds = capture.projectedBoundsByEntityId[entityId];
        return bounds === undefined ? [] : [bounds];
      });
      const minimumX = Math.min(...projected.map((bounds) =>
        bounds.centerRatioXY[0] - bounds.sizeRatioXY[0] / 2
      ));
      const maximumX = Math.max(...projected.map((bounds) =>
        bounds.centerRatioXY[0] + bounds.sizeRatioXY[0] / 2
      ));
      const minimumY = Math.min(...projected.map((bounds) =>
        bounds.centerRatioXY[1] - bounds.sizeRatioXY[1] / 2
      ));
      const maximumY = Math.max(...projected.map((bounds) =>
        bounds.centerRatioXY[1] + bounds.sizeRatioXY[1] / 2
      ));
      const observedCenter: readonly [number, number] | null = projected.length === 0
        ? null
        : [(minimumX + maximumX) / 2, (minimumY + maximumY) / 2];
      const observedSize: readonly [number, number] | null = projected.length === 0
        ? null
        : [maximumX - minimumX, maximumY - minimumY];
      const centerError = observedCenter === null
        ? Number.POSITIVE_INFINITY
        : Math.hypot(
            observedCenter[0] - anchor.center[0],
            observedCenter[1] - anchor.center[1],
          );
      const sizeError = anchor.size === undefined || observedSize === null
        ? 0
        : Math.hypot(
            observedSize[0] - anchor.size[0],
            observedSize[1] - anchor.size[1],
          ) * 0.5;
      const error = centerError + sizeError;
      return {
        id: anchor.id,
        expectedCenter: anchor.center,
        observedCenter,
        ...(anchor.size === undefined ? {} : { expectedSize: anchor.size }),
        observedSize,
        error,
        tolerance: anchor.tolerance,
        pass: error <= anchor.tolerance,
      };
    });
    const scores = [
      ...regions.map((region) => Math.min(1, region.iou / Math.max(1e-6, region.minimumIou))),
      ...anchors.map((anchor) => Math.max(0, 1 - anchor.error / anchor.tolerance)),
    ];
    const score = scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length);
    this.compositionCache = {
      dataUrl: capture.dataUrl,
      report: {
        score,
        minimumScore: guide.minimumScore,
        pass: score >= guide.minimumScore &&
          regions.every((region) => region.pass) &&
          anchors.every((anchor) => anchor.pass),
        regions,
        anchors,
      },
    };
    return this.compositionCache;
  }

  private executionEntityIdsForBinding(
    kind: "feature" | "runtime-entity",
    bindingId: string,
  ): readonly string[] {
    if (kind === "runtime-entity") return [bindingId];
    const prefix = `obj.${bindingId}.`;
    return this.executionPlan.objects
      .map((object) => object.entityId)
      .filter((entityId) => entityId.startsWith(prefix));
  }

  private artifactOpeningCameraPose() {
    const subject = this.executionPlan.subjects.find(
      (candidate) => candidate.entityId === this.executionPlan.camera.targetEntityId,
    );
    if (subject === undefined) {
      throw new Error("BABYLON_ARTIFACT_CAMERA_TARGET_UNAVAILABLE");
    }
    return {
      targetPositionMetersXYZ: [
        subject.spawnSubjectOriginPositionMetersXYZ[0],
        subject.spawnSubjectOriginPositionMetersXYZ[1] +
          subject.collider.centerOffsetFromSubjectOriginMetersXYZ[1],
        subject.spawnSubjectOriginPositionMetersXYZ[2],
      ] as const,
      targetHeightMeters: this.executionPlan.camera.targetHeightMeters,
      facingYawRadians: subject.spawnSubjectFacingRadians,
      pitchRadians: this.executionPlan.camera.pitchRadians,
      distanceMeters: this.executionPlan.camera.distanceMeters,
      fovDegrees: this.executionPlan.camera.fovDegrees,
    };
  }

  inspectFeatures(): readonly FeatureInspection[] {
    return structuredClone(this.inspections);
  }

  snapshot(): WorldSnapshot {
    const snapshot = this.activeRuntime().snapshot();
    if (snapshot.possessionTarget.mode === "unbound") {
      throw new Error("WORLDKIT_RUNTIME_CONTROL_UNBOUND");
    }
    const { controlledEntityId } = snapshot.possessionTarget;
    const controlledSubject = snapshot.subjectStatesByEntityId[controlledEntityId];
    if (controlledSubject === undefined) {
      throw new Error(
        `WORLDKIT_RUNTIME_SNAPSHOT_CONTROL_TARGET_NOT_FOUND: ${controlledEntityId}`,
      );
    }
    const forward = controlledSubject.forwardXYZ ?? [0, 0, -1];
    const facingYawRadians = Math.atan2(-forward[0], -forward[2]);
    const cameraYawOffsetRadians = snapshot.camera.viewYawOffsetRadians ?? 0;
    const cameraPitchOffsetRadians = snapshot.camera.viewPitchOffsetRadians ?? 0;
    const cameraDistanceOffsetMeters = snapshot.camera.viewDistanceOffsetMeters ?? 0;
    return {
      adapter: this.name,
      frame: this.frame,
      tick: snapshot.tick,
      paused: this.paused,
      player: {
        entityId: controlledSubject.entityId,
        action: activeActionForControlledSubject(snapshot),
        grounded: controlledSubject.movementMedium === "ground",
        position: controlledSubject.positionMetersXYZ,
        rotationY: facingYawRadians,
      },
      camera: {
        position: snapshot.camera.positionMetersXYZ,
        yaw: cameraYawOffsetRadians,
        pitch: this.executionPlan.camera.pitchRadians + cameraPitchOffsetRadians,
        distance: this.executionPlan.camera.distanceMeters + cameraDistanceOffsetMeters,
      },
      features: this.inspections,
      performance: {
        fps: this.displayFramesPerSecond,
        triangles: this.executionPlan.resourceUsage.triangles,
        drawCalls: this.runtimeSnapshot().resources.meshCount,
      },
    };
  }

  subscribe(listener: (snapshot: WorldSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    void this.disposeRuntime();
  }

  disposeRuntime(): Promise<void> {
    if (this.disposePromise !== null) return this.disposePromise;
    this.disposed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.detachCanvas(this.canvas);
    this.canvas.remove();
    this.disposePromise = this.coordinator.dispose();
    return this.disposePromise;
  }

  private activeRuntime(): BabylonWorldRuntime {
    return this.coordinator.activeRuntime() as BabylonWorldRuntime;
  }

  private attachCanvas(canvas: HTMLCanvasElement): void {
    canvas.className = "world-canvas";
    canvas.tabIndex = 0;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.handleCameraPointerDown);
    canvas.addEventListener("pointermove", this.handleCameraPointerMove);
    canvas.addEventListener("pointerup", this.handleCameraPointerUp);
    canvas.addEventListener("pointercancel", this.handleCameraPointerUp);
    canvas.addEventListener("wheel", this.handleCameraWheel, { passive: false });
  }

  private detachCanvas(canvas: HTMLCanvasElement): void {
    canvas.removeEventListener("pointerdown", this.handleCameraPointerDown);
    canvas.removeEventListener("pointermove", this.handleCameraPointerMove);
    canvas.removeEventListener("pointerup", this.handleCameraPointerUp);
    canvas.removeEventListener("pointercancel", this.handleCameraPointerUp);
    canvas.removeEventListener("wheel", this.handleCameraWheel);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.keyboardInput.press(event.code)) {
      event.preventDefault();
      return;
    }
    const cameraAction = CAMERA_KEY_ACTION_MAP[event.code];
    if (cameraAction === undefined) return;
    this.cameraInput.add(cameraAction);
    event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (this.keyboardInput.release(event.code)) {
      event.preventDefault();
      return;
    }
    const cameraAction = CAMERA_KEY_ACTION_MAP[event.code];
    if (cameraAction === undefined) return;
    this.cameraInput.delete(cameraAction);
    event.preventDefault();
  };

  private readonly handleBlur = (): void => {
    this.keyboardInput.clear();
    this.cameraInput.clear();
    this.activeCameraPointerId = null;
  };

  private readonly handleCameraPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.activeCameraPointerId = event.pointerId;
    this.lastCameraPointerPosition = [event.clientX, event.clientY];
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.focus();
    event.preventDefault();
  };

  private readonly handleCameraPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activeCameraPointerId) return;
    const deltaX = event.clientX - this.lastCameraPointerPosition[0];
    const deltaY = event.clientY - this.lastCameraPointerPosition[1];
    this.lastCameraPointerPosition = [event.clientX, event.clientY];
    this.adjustCameraViewRuntime({
      yawDeltaRadians: -deltaX * 0.006,
      pitchDeltaRadians: deltaY * 0.005,
    });
    event.preventDefault();
  };

  private readonly handleCameraPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activeCameraPointerId) return;
    this.activeCameraPointerId = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  };

  private readonly handleCameraWheel = (event: WheelEvent): void => {
    this.adjustCameraViewRuntime({ zoomDeltaMeters: event.deltaY * 0.008 });
    event.preventDefault();
  };

  private scheduleAnimationFrame(): void {
    if (this.disposed) return;
    this.animationFrameId = requestAnimationFrame((timestampMilliseconds) => {
      this.animationFrameId = null;
      void this.animate(timestampMilliseconds);
    });
  }

  private async animate(timestampMilliseconds: number): Promise<void> {
    if (this.disposed) return;
    const ticks = this.consumeFixedTicks(timestampMilliseconds);
    if (!this.paused && !this.animationPending && ticks > 0) {
      this.animationPending = true;
      try {
        const runtimeProjection = this.activeRuntime().snapshot();
        const controlledEntityId = runtimeProjection.possessionTarget.mode === "possessed"
          ? runtimeProjection.possessionTarget.controlledEntityId
          : undefined;
        if (!isNil(controlledEntityId)) {
          this.applyCameraActions([...this.cameraInput], ticks);
        }
        await this.coordinator.runFixedInput({
          actions: isNil(controlledEntityId)
            ? []
            : this.keyboardInput.actions(
              runtimeProjection.subjectStatesByEntityId[controlledEntityId]
                ?.activeMotionKernelRef,
            ),
          ticks,
        });
      } catch (error) {
        if (this.disposed) return;
        this.paused = true;
        this.frameLoopDiagnostic = {
          severity: "error",
          code: "WORLDKIT_RUNTIME_FRAME_FAILED",
          instancePath: "",
          message: "The runtime was paused after a simulation frame failed.",
        };
        console.error("WORLDKIT_RUNTIME_FRAME_FAILED", error);
      } finally {
        this.animationPending = false;
      }
    }
    if (this.disposed) return;
    this.render();
    this.emit();
    this.scheduleAnimationFrame();
  }

  private consumeFixedTicks(timestampMilliseconds: number): number {
    if (!Number.isFinite(timestampMilliseconds)) return 0;
    const previousTimestampMilliseconds = this.previousAnimationTimestampMilliseconds;
    this.previousAnimationTimestampMilliseconds = timestampMilliseconds;
    if (
      previousTimestampMilliseconds === null ||
      timestampMilliseconds <= previousTimestampMilliseconds
    ) {
      return 0;
    }
    const elapsedMilliseconds = timestampMilliseconds - previousTimestampMilliseconds;
    this.displayFramesPerSecond = Math.round(1_000 / elapsedMilliseconds);
    if (this.paused) {
      this.fixedStepAccumulatorSeconds = 0;
      return 0;
    }
    const maximumAccumulatedSeconds =
      FIXED_TIME_STEP_SECONDS * MAXIMUM_FIXED_TICKS_PER_DISPLAY_FRAME;
    this.fixedStepAccumulatorSeconds = Math.min(
      maximumAccumulatedSeconds,
      this.fixedStepAccumulatorSeconds +
        Math.min(elapsedMilliseconds / 1_000, maximumAccumulatedSeconds),
    );
    const ticks = Math.min(
      MAXIMUM_FIXED_TICKS_PER_DISPLAY_FRAME,
      Math.floor(
        (this.fixedStepAccumulatorSeconds + 1e-12) / FIXED_TIME_STEP_SECONDS,
      ),
    );
    this.fixedStepAccumulatorSeconds = Math.max(
      0,
      this.fixedStepAccumulatorSeconds - ticks * FIXED_TIME_STEP_SECONDS,
    );
    return ticks;
  }

  private resetAnimationClock(): void {
    this.previousAnimationTimestampMilliseconds = null;
    this.fixedStepAccumulatorSeconds = 0;
    this.displayFramesPerSecond = 0;
  }

  private applyCameraActions(
    actions: readonly InputAction[],
    ticks: number,
  ): void {
    if (ticks <= 0) return;
    const actionSet = new Set(actions);
    const yawDeltaRadians =
      (Number(actionSet.has("cameraLeft")) - Number(actionSet.has("cameraRight"))) *
      CAMERA_YAW_RADIANS_PER_TICK *
      ticks;
    const pitchDeltaRadians =
      (Number(actionSet.has("cameraDown")) - Number(actionSet.has("cameraUp"))) *
      CAMERA_PITCH_RADIANS_PER_TICK *
      ticks;
    if (yawDeltaRadians === 0 && pitchDeltaRadians === 0) return;
    this.activeRuntime().adjustCameraView({ yawDeltaRadians, pitchDeltaRadians });
  }

  private emit(): void {
    if (this.activeRuntime().snapshot().possessionTarget.mode === "unbound") {
      return;
    }
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
