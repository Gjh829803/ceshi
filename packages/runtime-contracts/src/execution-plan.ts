export type Vec2 = readonly [x: number, z: number];
export type Vec3 = readonly [x: number, y: number, z: number];

export interface CompileDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  instancePath: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
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

export interface SubjectAssetInventoryV1 {
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  skeletonCount: number;
  boneCount: number;
  animationClipNames: readonly string[];
}

export interface ExecutionSubjectAssetV1 {
  subjectAssetRef: string;
  artifactContentHash: string;
  byteLength: number;
  mediaType: "model/gltf-binary";
  format: "glb";
  inventory: SubjectAssetInventoryV1;
}

export type ExecutionBipedBoneIdV1 =
  | "root"
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "upper-arm.left"
  | "lower-arm.left"
  | "hand.left"
  | "upper-arm.right"
  | "lower-arm.right"
  | "hand.right"
  | "upper-leg.left"
  | "lower-leg.left"
  | "foot.left"
  | "upper-leg.right"
  | "lower-leg.right"
  | "foot.right";

export type ExecutionGroundHumanoidActionIdV1 =
  | "idle"
  | "walk"
  | "run"
  | "jump";

export interface ExecutionRigProfileV1 {
  rigProfileRef: string;
  bodyTopology: "biped";
  skeletonRootNodeName: string;
  requiredBoneIds: readonly ExecutionBipedBoneIdV1[];
  sourceNodeNameByBoneId: Readonly<Record<ExecutionBipedBoneIdV1, string>>;
}

export interface ExecutionAnimationBindingV1 {
  actionId: ExecutionGroundHumanoidActionIdV1;
  sourceClipName: string;
  loopMode: "repeat" | "once";
  playbackSpeedRatio: number;
  blendDurationSeconds: number;
  rootMotionMode: "in-place";
}

export interface ExecutionAnimationSetV1 {
  animationSetRef: string;
  subjectAssetRef: string;
  rigProfileRef: string;
  defaultActionId: ExecutionGroundHumanoidActionIdV1;
  requiredActionIds: readonly ExecutionGroundHumanoidActionIdV1[];
  animationBindings: readonly ExecutionAnimationBindingV1[];
}

export interface ExecutionSubjectCapsuleV1 {
  kind: "capsule";
  radiusMeters: number;
  heightMeters: number;
  centerOffsetFromSubjectOriginMetersXYZ: Vec3;
}

export interface ExecutionColliderProfileV1 {
  colliderProfileRef: string;
  supportedBodyTopologies: readonly ("biped" | "quadruped" | "custom")[];
  collider: ExecutionSubjectCapsuleV1;
}

export interface SubjectVisualPrimitivePartV3 {
  id: string;
  kind: "primitive";
  shape: SubjectVisualPrimitiveV3;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

export interface SubjectVisualAssetPartV3 {
  id: string;
  kind: "asset";
  subjectAssetRef: string;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
    scaleXYZ: Vec3;
  };
  appearance: { mode: "whitebox-neutral" };
  semanticTags: readonly string[];
}

export type SubjectVisualPartV3 =
  | SubjectVisualPrimitivePartV3
  | SubjectVisualAssetPartV3;

export interface SubjectLocalSocketV3 {
  id: string;
  kind: "local";
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

export interface SubjectBoneSocketV3 {
  id: string;
  kind: "bone";
  boneId: ExecutionBipedBoneIdV1;
  offsetTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

export type SubjectSocketV3 = SubjectLocalSocketV3 | SubjectBoneSocketV3;

export type ExecutionSubjectVisualBindingV1 =
  | { mode: "static" }
  | {
      mode: "rigged";
      rigProfileRef: string;
      animationSetRef: string;
    };

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
  visualBinding: ExecutionSubjectVisualBindingV1;
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
    walkSpeedMetersPerSecond: number;
    runSpeedMetersPerSecond: number;
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
  subjectAssets: readonly ExecutionSubjectAssetV1[];
  rigProfiles: readonly ExecutionRigProfileV1[];
  animationSets: readonly ExecutionAnimationSetV1[];
  colliderProfiles: readonly ExecutionColliderProfileV1[];
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
