import type { Vec3 } from "./execution-plan";

export type SemanticInputActionV1 =
  | "move-forward"
  | "move-backward"
  | "move-left"
  | "move-right"
  | "jump";

export interface FixedInputV1 {
  actions: readonly SemanticInputActionV1[];
  ticks: number;
}

export const TRUSTED_DEFAULT_CONTROLLER_ID = "controller-primary" as const;

export interface BindControlRequestV2 {
  controllerId: string;
  controlledEntityId: string;
  expectedControlledEntityId: string;
}

export interface ControlBindingReceiptV2 {
  kind: "worldkit-control-binding-receipt";
  schemaVersion: 2;
  status: "committed" | "rejected";
  controllerId: string;
  previousControlledEntityId: string;
  controlledEntityId: string;
  diagnostic?: {
    code:
      | "CONTROL_BINDING_STALE"
      | "CONTROL_CONTROLLER_NOT_FOUND"
      | "CONTROL_TARGET_NOT_FOUND";
    message: string;
  };
}

export interface ControllerRuntimeStateV3 {
  id: string;
  controlledEntityId: string;
}

export interface SubjectRuntimeStateV3 {
  entityId: string;
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  positionMetersXYZ: Vec3;
  velocityMetersPerSecondXYZ: Vec3;
  movementMedium: "ground" | "air" | "water";
}

export interface WorldRuntimeSnapshotV3 {
  kind: "worldkit-runtime-snapshot";
  schemaVersion: 3;
  runtimeBackend: "babylon-havok";
  tick: number;
  ready: boolean;
  controlledEntityId: string;
  controllersById: Readonly<Record<string, ControllerRuntimeStateV3>>;
  subjectStatesByEntityId: Readonly<Record<string, SubjectRuntimeStateV3>>;
  camera: {
    entityId: string;
    targetEntityId: string;
    positionMetersXYZ: Vec3;
  };
  physics: { backend: "havok"; ready: boolean; fixedTimeStepSeconds: number };
  resources: {
    meshes: number;
    bodies: number;
    terrainSamples: number;
  };
}

export interface WorldRuntimeSessionV3 {
  readonly runtimeBackend: "babylon-havok";
  readonly ready: Promise<void>;
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV3>;
  snapshot(): WorldRuntimeSnapshotV3;
  reset(): WorldRuntimeSnapshotV3;
  renderFrame(): void;
  dispose(): Promise<void>;
}

export const WORLDKIT_BROWSER_PROTOCOL_VERSION = 3 as const;

export interface WorldkitBrowserApiV3 {
  version: typeof WORLDKIT_BROWSER_PROTOCOL_VERSION;
  ready(): Promise<WorldRuntimeSnapshotV3>;
  getSnapshot(): WorldRuntimeSnapshotV3;
  getDiagnostics(): readonly Readonly<Record<string, unknown>>[];
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV3>;
  captureScreenshot(): string;
  reset(): WorldRuntimeSnapshotV3;
  setPaused(paused: boolean): WorldRuntimeSnapshotV3;
}
