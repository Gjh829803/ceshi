import type {
  DerivedWorldPlanArtifacts,
  OutdoorWorldSpec,
  VisualPrototypeSpec,
} from "@whitebox-world/world";

export type InputAction =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "run"
  | "jump"
  | "cameraLeft"
  | "cameraRight"
  | "cameraUp"
  | "cameraDown";

export interface FixedInputStep {
  actions: readonly InputAction[];
  ticks: number;
}

export interface FeatureInspection {
  id: string;
  type: string;
  version: number;
  seed?: number;
  status: "ready" | "building" | "error";
  resources: readonly {
    id: string;
    kind: "mesh" | "surface" | "collider" | "semantic";
    vertices?: number;
  }[];
  parameters: Readonly<Record<string, unknown>>;
  diagnostics: readonly {
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
  }[];
}

export interface WorldSnapshot {
  adapter: string;
  frame: number;
  tick: number;
  paused: boolean;
  player: {
    entityId: string;
    action: "idle" | "walk" | "run" | "jump";
    grounded: boolean;
    position: readonly [number, number, number];
    rotationY: number;
  };
  camera: {
    position: readonly [number, number, number];
    yaw: number;
    pitch: number;
    distance: number;
  };
  features: readonly FeatureInspection[];
  performance: {
    fps: number;
    triangles: number;
    drawCalls: number;
  };
}

export interface OpeningCompositionReport {
  score: number;
  minimumScore: number;
  pass: boolean;
  regions: readonly {
    id: string;
    iou: number;
    minimumIou: number;
    pass: boolean;
  }[];
  anchors: readonly {
    id: string;
    expectedCenter: readonly [number, number];
    observedCenter: readonly [number, number] | null;
    expectedSize?: readonly [number, number];
    observedSize: readonly [number, number] | null;
    error: number;
    tolerance: number;
    pass: boolean;
  }[];
}

export interface PlaygroundWorldAdapter {
  readonly name: string;
  readonly canvas: HTMLCanvasElement;
  mount(container: HTMLElement): void;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  reset(): void;
  render(): void;
  runFixedInput(steps: readonly FixedInputStep[]): Promise<WorldSnapshot>;
  captureScreenshot(): string;
  captureCompositionMask(): string;
  analyzeOpeningComposition(): OpeningCompositionReport | null;
  exportOpeningFrame(report?: OpeningCompositionReport): Promise<string>;
  getWorldSpec(): OutdoorWorldSpec | null;
  getPlanArtifacts(): DerivedWorldPlanArtifacts | null;
  capturePlanningView(kind: PlanningViewKind): string;
  getVisualPrototypes(): readonly VisualPrototypeSpec[];
  captureWhiteboxTriview(prototypeId: string): string;
  exportWhiteboxTriviews(): Promise<readonly string[]>;
  inspectFeatures(): readonly FeatureInspection[];
  snapshot(): WorldSnapshot;
  subscribe(listener: (snapshot: WorldSnapshot) => void): () => void;
  dispose(): void;
}

export interface PlaygroundAutomationApi {
  version: 3;
  getSnapshot(): WorldSnapshot;
  inspectFeatures(): readonly FeatureInspection[];
  runFixedInput(steps: readonly FixedInputStep[]): Promise<WorldSnapshot>;
  captureScreenshot(): string;
  captureCompositionMask(): string;
  analyzeOpeningComposition(): OpeningCompositionReport | null;
  exportOpeningFrame(report?: OpeningCompositionReport): Promise<string>;
  getWorldSpec(): OutdoorWorldSpec | null;
  getPlanArtifacts(): DerivedWorldPlanArtifacts | null;
  capturePlanningView(kind: PlanningViewKind): string;
  getVisualPrototypes(): readonly VisualPrototypeSpec[];
  captureWhiteboxTriview(prototypeId: string): string;
  exportWhiteboxTriviews(): Promise<readonly string[]>;
  reset(): WorldSnapshot;
  setPaused(paused: boolean): WorldSnapshot;
}

declare global {
  interface Window {
    __WHITEBOX_PLAYGROUND__: PlaygroundAutomationApi;
  }
}

export type PlanningViewKind = "world-plan" | "height-slope-plan" | "opening-shot";
