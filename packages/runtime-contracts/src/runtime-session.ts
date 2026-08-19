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

export interface WorldRuntimeSnapshotV1 {
  kind: "worldkit-runtime-snapshot";
  schemaVersion: 1;
  runtimeBackend: "babylon-havok";
  tick: number;
  ready: boolean;
  physics: { backend: "havok"; ready: boolean; fixedTimeStepSeconds: number };
  subject: {
    entityId: string;
    positionMeters: Vec3;
    velocityMetersPerSecond: Vec3;
    movementMedium: "ground" | "air" | "water";
  };
  camera: {
    entityId: string;
    targetEntityId: string;
    positionMeters: Vec3;
  };
  resources: {
    meshes: number;
    bodies: number;
    terrainSamples: number;
  };
}

/** Historical singular runtime session retained for the V1 Babylon adapter. */
export interface WorldRuntimeSession {
  readonly runtimeBackend: "babylon-havok";
  readonly ready: Promise<void>;
  runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV1>;
  snapshot(): WorldRuntimeSnapshotV1;
  reset(): WorldRuntimeSnapshotV1;
  renderFrame(): void;
  dispose(): Promise<void>;
}

export const TRUSTED_DEFAULT_CONTROLLER_ID = "controller-primary" as const;

export interface SubjectStateSnapshotV2 {
  entityId: string;
  positionMeters: Vec3;
  velocityMetersPerSecond: Vec3;
  movementMedium: "ground" | "air" | "water";
}

export interface ControllerStateSnapshotV2 {
  id: string;
  controlledEntityId: string;
}

export interface WorldRuntimeSnapshotV2 {
  kind: "worldkit-runtime-snapshot";
  schemaVersion: 2;
  runtimeBackend: "babylon-havok";
  tick: number;
  ready: boolean;
  controlledEntityId: string;
  controllersById: Readonly<Record<string, ControllerStateSnapshotV2>>;
  subjectStatesByEntityId: Readonly<Record<string, SubjectStateSnapshotV2>>;
  camera: {
    entityId: string;
    targetEntityId: string;
    positionMeters: Vec3;
  };
  physics: { backend: "havok"; ready: boolean; fixedTimeStepSeconds: number };
  resources: {
    meshes: number;
    bodies: number;
    terrainSamples: number;
  };
}

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
    code: "CONTROL_BINDING_STALE" | "CONTROL_TARGET_NOT_FOUND";
    message: string;
  };
}

export interface WorldRuntimeSessionV2 {
  readonly runtimeBackend: "babylon-havok";
  readonly ready: Promise<void>;
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV2>;
  snapshot(): WorldRuntimeSnapshotV2;
  reset(): WorldRuntimeSnapshotV2;
  renderFrame(): void;
  dispose(): Promise<void>;
}
