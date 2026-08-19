export type Vec2 = readonly [x: number, z: number];
export type Vec3 = readonly [x: number, y: number, z: number];

export interface ExecutionTransformV1 {
  positionMeters: Vec3;
  rotationEulerRadiansXYZ: Vec3;
  scaleXYZ: Vec3;
}

export type ExecutionWaterBoundaryV1 =
  | { kind: "circle"; centerXZ: Vec2; radiusMeters: number }
  | { kind: "ellipse"; centerXZ: Vec2; radiusMetersXZ: Vec2 }
  | { kind: "polygon"; pointsXZ: readonly Vec2[] };

export interface ExecutionTerrainV1 {
  entityId: string;
  centerXZ: Vec2;
  sizeXZ: Vec2;
  resolutionXZ: readonly [columns: number, rows: number];
  /** Row-major: x changes fastest, then z. */
  heightSamplesMeters: readonly number[];
  heightSamplesHash: string;
  minimumHeightMeters: number;
  maximumHeightMeters: number;
  semanticClassId: string;
}

export interface ExecutionWaterV1 {
  entityId: string;
  terrainEntityId: string;
  boundary: ExecutionWaterBoundaryV1;
  depthMeters: number;
  shoreWidthMeters: number;
  waterLevelMeters: number;
  traversalMode: "blocked" | "swimmable" | "walkable";
  semanticClassId: string;
}

export type ExecutionPrimitiveV1 =
  | { kind: "box"; sizeMetersXYZ: Vec3 }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder" | "cone"; radiusMeters: number; heightMeters: number };

export interface ExecutionObjectV1 {
  entityId: string;
  prototypeId: string;
  primitive: ExecutionPrimitiveV1;
  transform: ExecutionTransformV1;
  collisionEnabled: boolean;
  semanticClassId: string;
}

export interface ExecutionSubjectV1 {
  entityId: string;
  kitRef: "worldkit://kit/humanoid.third-person@1";
  spawnAnchorEntityId: string;
  spawnPositionMeters: Vec3;
  forwardDirection: "-z";
  capsule: { radiusMeters: number; heightMeters: number };
  movement: {
    groundSpeedMetersPerSecond: number;
    waterSpeedMetersPerSecond: number;
    jumpSpeedMetersPerSecond: number;
  };
}

export interface ExecutionCameraV1 {
  cameraEntityId: string;
  rigRef: "worldkit://camera/third-person.standard@1";
  targetEntityId: string;
  pitchRadians: number;
  distanceMeters: number;
  targetHeightMeters: number;
  fovDegrees: number;
  manualSwitchAllowed: boolean;
}

export interface ExecutionPlanV1 {
  kind: "worldkit-execution-plan";
  schemaVersion: 1;
  id: string;
  seed: number;
  runtimeBackend: "babylon-havok";
  normalizedWorldIrHash: string;
  coordinateSystem: "right-handed-y-up-minus-z-forward";
  gravityMetersPerSecondSquaredXYZ: Vec3;
  atmospherePreset: "clear-day" | "golden-hour" | "overcast" | "night";
  terrain: ExecutionTerrainV1;
  waters: readonly ExecutionWaterV1[];
  objects: readonly ExecutionObjectV1[];
  subject: ExecutionSubjectV1;
  camera: ExecutionCameraV1;
  resourceUsage: {
    vertices: number;
    triangles: number;
    colliders: number;
  };
}

export interface CompileDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  instancePath: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface CompileWorldResult {
  ok: boolean;
  executionPlan?: ExecutionPlanV1;
  executionPlanHash?: string;
  diagnostics: readonly CompileDiagnostic[];
}

export type SubjectVisualPrimitiveV2 =
  | { kind: "capsule"; radiusMeters: number; heightMeters: number }
  | { kind: "box"; sizeMetersXYZ: Vec3 }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder"; radiusMeters: number; heightMeters: number };

export interface SubjectVisualPartV2 {
  id: string;
  primitive: SubjectVisualPrimitiveV2;
  localPositionMeters: Vec3;
  localRotationEulerRadiansXYZ: Vec3;
}

export interface ExecutionSubjectV2 {
  entityId: string;
  kitRef: string;
  bodyTopology: string;
  semanticClassId: string;
  spawnAnchorEntityId: string;
  spawnPositionMeters: Vec3;
  forwardDirection: "-z";
  visualParts: readonly SubjectVisualPartV2[];
  collider: {
    kind: "capsule";
    radiusMeters: number;
    heightMeters: number;
    massKilograms: number;
    maxSlopeDegrees: number;
    maxStepHeightMeters: number;
  };
  locomotion: {
    mode: "ground";
    groundSpeedMetersPerSecond: number;
    waterSpeedMetersPerSecond: number;
    jumpSpeedMetersPerSecond: number;
  };
}

export interface ExecutionPlanV2 {
  kind: "worldkit-execution-plan";
  schemaVersion: 2;
  id: string;
  seed: number;
  runtimeBackend: "babylon-havok";
  normalizedWorldIrHash: string;
  coordinateSystem: "right-handed-y-up-minus-z-forward";
  gravityMetersPerSecondSquaredXYZ: Vec3;
  atmospherePreset: "clear-day" | "golden-hour" | "overcast" | "night";
  terrain: ExecutionTerrainV1;
  waters: readonly ExecutionWaterV1[];
  objects: readonly ExecutionObjectV1[];
  controlledEntityId: string;
  subjects: readonly ExecutionSubjectV2[];
  camera: ExecutionCameraV1;
  resourceUsage: {
    vertices: number;
    triangles: number;
    colliders: number;
  };
}

export interface CompileWorldResultV2 {
  ok: boolean;
  executionPlan?: ExecutionPlanV2;
  executionPlanHash?: string;
  diagnostics: readonly CompileDiagnostic[];
}
