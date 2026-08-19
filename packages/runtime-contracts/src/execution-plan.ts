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

export interface ExecutionTransformV3 {
  positionMetersXYZ: Vec3;
  rotationEulerRadiansXYZ: Vec3;
  scaleXYZ: Vec3;
}

export type ExecutionWaterBoundaryV3 =
  | { kind: "circle"; centerMetersXZ: Vec2; radiusMeters: number }
  | { kind: "ellipse"; centerMetersXZ: Vec2; radiusMetersXZ: Vec2 }
  | { kind: "polygon"; pointsMetersXZ: readonly Vec2[] };

export interface ExecutionTerrainV3 {
  entityId: string;
  centerMetersXZ: Vec2;
  sizeMetersXZ: Vec2;
  resolutionCellsXZ: readonly [columns: number, rows: number];
  /** Row-major: X changes fastest, then Z. */
  heightSamplesMeters: readonly number[];
  heightSamplesHash: string;
  minimumHeightMeters: number;
  maximumHeightMeters: number;
  semanticClassId: string;
}

export interface ExecutionWaterV3 {
  entityId: string;
  terrainEntityId: string;
  boundary: ExecutionWaterBoundaryV3;
  depthMeters: number;
  shoreWidthMeters: number;
  waterLevelMeters: number;
  traversalMode: "blocked" | "swimmable" | "walkable";
  semanticClassId: string;
}

export type ExecutionObjectPrimitiveV3 =
  | { kind: "box"; sizeMetersXYZ: Vec3 }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder" | "cone"; radiusMeters: number; heightMeters: number };

export interface ExecutionObjectV3 {
  entityId: string;
  prototypeId: string;
  primitive: ExecutionObjectPrimitiveV3;
  transform: ExecutionTransformV3;
  collisionEnabled: boolean;
  semanticClassId: string;
}

export type SubjectVisualPrimitiveV3 =
  | { kind: "box"; sizeMetersXYZ: Vec3 }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder"; radiusMeters: number; heightMeters: number }
  | { kind: "capsule"; radiusMeters: number; heightMeters: number };

export interface SubjectVisualPartV3 {
  id: string;
  kind: "primitive";
  shape: SubjectVisualPrimitiveV3;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

export interface SubjectSocketV3 {
  id: string;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

export interface ExecutionSubjectV3 {
  entityId: string;
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  bodyTopology: string;
  semanticClassId: string;
  spawnAnchorEntityId: string;
  spawnSubjectOriginPositionMetersXYZ: Vec3;
  forwardDirection: "-z";
  visualParts: readonly SubjectVisualPartV3[];
  sockets: readonly SubjectSocketV3[];
  collider: {
    kind: "capsule";
    radiusMeters: number;
    heightMeters: number;
    centerOffsetFromSubjectOriginMetersXYZ: Vec3;
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

export interface ExecutionCameraV3 {
  cameraEntityId: string;
  rigRef: "worldkit://camera/third-person.standard@1";
  targetEntityId: string;
  pitchRadians: number;
  distanceMeters: number;
  targetHeightMeters: number;
  fovDegrees: number;
  manualSwitchAllowed: boolean;
}

export interface ExecutionPlanV3 {
  kind: "worldkit-execution-plan";
  schemaVersion: 3;
  id: string;
  seed: number;
  runtimeBackend: "babylon-havok";
  normalizedWorldIrHash: string;
  resourceLockHash: string;
  coordinateSystem: "right-handed-y-up-minus-z-forward";
  gravityMetersPerSecondSquaredXYZ: Vec3;
  atmospherePreset: "clear-day" | "golden-hour" | "overcast" | "night";
  terrain: ExecutionTerrainV3;
  waters: readonly ExecutionWaterV3[];
  objects: readonly ExecutionObjectV3[];
  controlledEntityId: string;
  subjects: readonly ExecutionSubjectV3[];
  camera: ExecutionCameraV3;
  resourceUsage: {
    vertices: number;
    triangles: number;
    colliders: number;
  };
}

export interface CompileWorldResultV3 {
  ok: boolean;
  executionPlan?: ExecutionPlanV3;
  executionPlanHash?: string;
  diagnostics: readonly CompileDiagnostic[];
}
