import type {
  BindControlRequestV2,
  ControlBindingReceiptV2,
  ExecutionPlanV2,
  FixedInputV1,
  SemanticInputActionV1,
  WorldRuntimeSnapshotV2,
} from "@whitebox-world/runtime-contracts";
import { BabylonWorldRuntime } from "@whitebox-world/runtime-babylon";

import type {
  FeatureInspection,
  FixedInputStep,
  InputAction,
  PlaygroundWorldAdapter,
  WorldSnapshot,
} from "./playground-world";

const INPUT_ACTION_MAP: Readonly<Partial<Record<InputAction, SemanticInputActionV1>>> = {
  forward: "move-forward",
  backward: "move-backward",
  left: "move-left",
  right: "move-right",
  jump: "jump",
};

const KEY_ACTION_MAP: Readonly<Record<string, SemanticInputActionV1>> = {
  KeyW: "move-forward",
  KeyS: "move-backward",
  KeyA: "move-left",
  KeyD: "move-right",
  Space: "jump",
};

export function featureInspections(plan: ExecutionPlanV2): readonly FeatureInspection[] {
  return [
    {
      id: plan.terrain.entityId,
      type: "runtime.terrain-heightfield",
      version: 1,
      seed: plan.seed,
      status: "ready",
      parameters: {
        centerXZ: plan.terrain.centerXZ,
        sizeXZ: plan.terrain.sizeXZ,
        resolutionXZ: plan.terrain.resolutionXZ,
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
        kitRef: subject.kitRef,
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
  readonly canvas: HTMLCanvasElement;

  private readonly listeners = new Set<(snapshot: WorldSnapshot) => void>();
  private readonly pressed = new Set<SemanticInputActionV1>();
  private readonly inspections: readonly FeatureInspection[];
  private readonly resizeObserver: ResizeObserver;
  private animationFrameId: number | null = null;
  private frame = 0;
  private paused = false;
  private disposed = false;
  private animationPending = false;

  private constructor(
    private readonly executionPlan: ExecutionPlanV2,
    private readonly runtime: BabylonWorldRuntime,
    canvas: HTMLCanvasElement,
  ) {
    this.name = `babylon-havok/${executionPlan.id}`;
    this.canvas = canvas;
    this.canvas.className = "world-canvas";
    this.canvas.tabIndex = 0;
    this.inspections = featureInspections(executionPlan);
    this.resizeObserver = new ResizeObserver(() => this.runtime.resize());
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
  }

  static async create(executionPlan: ExecutionPlanV2): Promise<BabylonWorldAdapter> {
    const canvas = document.createElement("canvas");
    const runtime = await BabylonWorldRuntime.create({
      executionPlan,
      canvas,
      autoStartRenderLoop: false,
    });
    runtime.renderFrame();
    return new BabylonWorldAdapter(executionPlan, runtime, canvas);
  }

  mount(container: HTMLElement): void {
    container.append(this.canvas);
    this.resizeObserver.observe(container);
    this.runtime.resize();
    this.canvas.focus();
    this.scheduleAnimationFrame();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.emit();
  }

  isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    this.pressed.clear();
    this.runtime.reset();
    this.render();
    this.emit();
  }

  render(): void {
    this.runtime.renderFrame();
    this.frame += 1;
  }

  async runFixedInput(steps: readonly FixedInputStep[]): Promise<WorldSnapshot> {
    const wasPaused = this.paused;
    this.paused = true;
    for (const step of steps) {
      await this.runtime.runFixedInput({
        actions: step.actions.flatMap((action) => {
          const mapped = INPUT_ACTION_MAP[action];
          return mapped === undefined ? [] : [mapped];
        }),
        ticks: Math.max(0, Math.floor(step.ticks)),
      });
    }
    this.paused = wasPaused;
    this.render();
    this.emit();
    return this.snapshot();
  }

  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2 {
    const receipt = this.runtime.bindControl(request);
    if (receipt.status === "committed") {
      this.render();
      this.emit();
    }
    return receipt;
  }

  async runWorldkitFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV2> {
    const wasPaused = this.paused;
    this.paused = true;
    let snapshot = this.runtime.snapshot();
    for (const step of steps) snapshot = await this.runtime.runFixedInput(step);
    this.paused = wasPaused;
    this.render();
    this.emit();
    return snapshot;
  }

  runtimeSnapshot(): WorldRuntimeSnapshotV2 {
    return this.runtime.snapshot();
  }

  resetRuntime(): WorldRuntimeSnapshotV2 {
    const snapshot = this.runtime.reset();
    this.render();
    this.emit();
    return snapshot;
  }

  captureScreenshot(): string {
    this.render();
    return this.canvas.toDataURL("image/png");
  }

  captureCompositionMask(): string {
    return "";
  }

  analyzeOpeningComposition(): null {
    return null;
  }

  async exportOpeningFrame(): Promise<string> {
    throw new Error("Opening-frame artifact export is not available for Canonical JSON V1.");
  }

  getWorldSpec(): null {
    return null;
  }

  getPlanArtifacts(): null {
    return null;
  }

  capturePlanningView(): string {
    throw new Error("Planning views are not available for Canonical JSON V1.");
  }

  getVisualPrototypes(): readonly [] {
    return [];
  }

  captureWhiteboxTriview(): string {
    throw new Error("Prototype tri-view export is not available for Canonical JSON V1.");
  }

  async exportWhiteboxTriviews(): Promise<readonly string[]> {
    return [];
  }

  inspectFeatures(): readonly FeatureInspection[] {
    return this.inspections;
  }

  snapshot(): WorldSnapshot {
    const snapshot = this.runtime.snapshot();
    const controlledSubject = snapshot.subjectStatesByEntityId[snapshot.controlledEntityId];
    if (controlledSubject === undefined) {
      throw new Error(
        `WORLDKIT_RUNTIME_SNAPSHOT_CONTROL_TARGET_NOT_FOUND: ${snapshot.controlledEntityId}`,
      );
    }
    const moving = Math.hypot(
      controlledSubject.velocityMetersPerSecond[0],
      controlledSubject.velocityMetersPerSecond[2],
    ) > 0.05;
    return {
      adapter: this.name,
      frame: this.frame,
      tick: snapshot.tick,
      paused: this.paused,
      player: {
        entityId: controlledSubject.entityId,
        action: moving ? "walk" : "idle",
        grounded: controlledSubject.movementMedium === "ground",
        position: controlledSubject.positionMeters,
        rotationY: 0,
      },
      camera: {
        position: snapshot.camera.positionMeters,
        yaw: 0,
        pitch: this.executionPlan.camera.pitchRadians,
        distance: this.executionPlan.camera.distanceMeters,
      },
      features: this.inspections,
      performance: {
        fps: 60,
        triangles: this.executionPlan.resourceUsage.triangles,
        drawCalls: this.runtimeSnapshot().resources.meshes,
      },
    };
  }

  subscribe(listener: (snapshot: WorldSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    void this.runtime.dispose();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const action = KEY_ACTION_MAP[event.code];
    if (action === undefined) return;
    event.preventDefault();
    this.pressed.add(action);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const action = KEY_ACTION_MAP[event.code];
    if (action === undefined) return;
    event.preventDefault();
    this.pressed.delete(action);
  };

  private readonly handleBlur = (): void => {
    this.pressed.clear();
  };

  private scheduleAnimationFrame(): void {
    this.animationFrameId = requestAnimationFrame(() => {
      this.animationFrameId = null;
      void this.animate();
    });
  }

  private async animate(): Promise<void> {
    if (this.disposed) return;
    if (!this.paused && !this.animationPending) {
      this.animationPending = true;
      try {
        await this.runtime.runFixedInput({ actions: [...this.pressed], ticks: 1 });
      } finally {
        this.animationPending = false;
      }
    }
    this.render();
    this.emit();
    this.scheduleAnimationFrame();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
