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

export interface WorldRuntimeSession {
  readonly runtimeBackend: "babylon-havok";
  readonly ready: Promise<void>;
  runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV1>;
  snapshot(): WorldRuntimeSnapshotV1;
  reset(): WorldRuntimeSnapshotV1;
  renderFrame(): void;
  dispose(): Promise<void>;
}
