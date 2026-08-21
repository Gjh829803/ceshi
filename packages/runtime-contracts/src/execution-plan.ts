import type {
  CameraRigParameterNameV1,
  CameraRigParametersV1,
} from "./camera-parameter-contract";

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
  | "idle.gaming"
  | "walk"
  | "walk.step"
  | "run"
  | "jump"
  | "fall"
  | "land.hard"
  | "land.hard.alt"
  | "fly"
  | "float"
  | "swim.surface"
  | "swim.tread"
  | "swim.exit"
  | "sit"
  | "sit.idle"
  | "sit.ground.idle"
  | "sit.toStand"
  | "stand"
  | "lay.idle"
  | "roll.toRun"
  | "fight.enter"
  | "emote.salute"
  | "emote.angry"
  | "dance.rumba";

export interface ExecutionRigProfileV1 {
  rigProfileRef: string;
  bodyTopology: "biped";
  skeletonRootBoneName: string;
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
  supportedBodyTopologies: readonly (
    | "biped"
    | "quadruped"
    | "four-wheel"
    | "surface-craft"
    | "watercraft"
    | "glider"
    | "composite"
    | "custom"
  )[];
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

export type ExecutionMovementMediumV1 = "ground" | "water" | "air";
export type ExecutionMotionCommandKindV1 =
  | "planar-vector"
  | "throttle-steer"
  | "flight-attitude"
  | "none";

export interface ExecutionMotionProfileV1 {
  resourceRef: string;
  contentHash: string;
  motionKernelRef: string;
  motionTags: readonly string[];
}

export interface ExecutionMotionKernelDefinitionV1 {
  resourceRef: string;
  implementationId:
    | "free-ground"
    | "forward-steer"
    | "wheeled-arcade"
    | "surface-slide"
    | "water-surface"
    | "unpowered-glide";
  commandKind: ExecutionMotionCommandKindV1;
  supportedMediums: readonly ExecutionMovementMediumV1[];
  runtimeParameterNames: readonly string[];
  fallbackMotionProfileRef: string;
  deterministic: true;
}

export interface ExecutionControlProfileV1 {
  resourceRef: string;
  contentHash: string;
  commandKind: ExecutionMotionCommandKindV1;
  inputSpace: "camera-relative" | "subject-local" | "flight-frame" | "none";
  facingPolicy:
    | "align-to-move"
    | "align-to-view"
    | "steering-derived"
    | "flight-derived"
    | "fixed";
  lateralMovementPolicy: "allowed" | "forbidden";
  moveDeadzoneRatio: number;
}

export interface ExecutionCameraRigProfileV1 {
  resourceRef: string;
  contentHash: string;
  baseMode:
    | "first-person"
    | "free-orbit"
    | "stable-follow"
    | "speed-chase"
    | "flight-horizon";
  algorithmRef: string;
  headingSource: "view" | "target-forward" | "target-velocity";
  reverseHeadingPolicy: "follow-velocity" | "preserve-target-forward";
  recenterMode: "off" | "forward-motion" | "always";
  preferredSocketIds: readonly string[];
  parameters: CameraRigParametersV1;
  authoringRanges?: Readonly<Partial<
    Record<CameraRigParameterNameV1, { minimum: number; maximum: number; step: number }>
  >>;
}

export interface ExecutionCameraModifierProfileV1 {
  resourceRef: string;
  parameterOverrides: Readonly<Partial<ExecutionCameraRigProfileV1["parameters"]>>;
  headingSourceOverride?: ExecutionCameraRigProfileV1["headingSource"];
  reverseHeadingPolicyOverride?: ExecutionCameraRigProfileV1["reverseHeadingPolicy"];
  recenterModeOverride?: ExecutionCameraRigProfileV1["recenterMode"];
}

export interface ExecutionCameraContextRuleV1 {
  id: string;
  priority: number;
  when: {
    relationshipRoles?: readonly ("none" | "rider" | "driver" | "passenger" | "tethered")[];
    motionKernelRefs?: readonly string[];
    requiredMotionTags?: readonly string[];
    movementMediums?: readonly ExecutionMovementMediumV1[];
    minimumSpeedMetersPerSecond?: number;
    maximumSpeedMetersPerSecond?: number;
    requiredSocketIds?: readonly string[];
    requiredCameraContextTags?: readonly string[];
  };
  cameraRigProfileRef?: string;
  cameraModifierRefs?: readonly string[];
}

export interface ExecutionSubjectCapabilityAssemblyV1 {
  authoringAvailability: "recommended" | "advanced" | "experimental";
  defaultMotionProfile: ExecutionMotionProfileV1;
  optionalMotionProfiles: readonly ExecutionMotionProfileV1[];
  fallbackMotionProfile: ExecutionMotionProfileV1;
  motionKernels: readonly ExecutionMotionKernelDefinitionV1[];
  controlProfile: ExecutionControlProfileV1;
  cameraContext: {
    resourceRef: string;
    defaultCameraRigProfileRef: string;
    firstPersonCameraRigProfileRef?: string;
    rules: readonly ExecutionCameraContextRuleV1[];
    cameraRigProfiles: readonly ExecutionCameraRigProfileV1[];
    cameraModifierProfiles: readonly ExecutionCameraModifierProfileV1[];
  };
  mediumProfile: {
    resourceRef: string;
    air: { gravityRatio: number; linearDragPerSecond: number };
  };
  relationshipProfiles: readonly {
    resourceRef: string;
    relationshipType: "seat" | "tether";
    requiredSourceSocketIds: readonly string[];
    requiredTargetSocketIds: readonly string[];
    controlTransferPolicy: "keep-source" | "transfer-to-target" | "none";
    cameraTargetPolicy: "controlled-entity" | "source-entity" | "target-entity";
    maximumDistanceMeters?: number;
  }[];
  harnessProfileRef: string;
  requiredHarnessCheckIds: readonly string[];
  actionOrPoseSetRef: string;
  renderBindingProfileRef: string;
}

export interface ExecutionSubjectV3 {
  entityId: string;
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  bodyTopology: string;
  semanticClassId: string;
  spawnAnchorEntityId: string;
  spawnSubjectOriginPositionMetersXYZ: Vec3;
  spawnSubjectFacingRadians: number;
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
    allowWalk: boolean;
    allowRun: boolean;
    allowJump: boolean;
  };
  controlFeel: {
    resourceRef: string;
    contentHash: string;
    walkSpeedMetersPerSecond: number;
    runSpeedMetersPerSecond: number;
    jumpSpeedMetersPerSecond: number;
    accelerationMetersPerSecondSquared: number;
    decelerationMetersPerSecondSquared: number;
    turnRateRadiansPerSecond: number;
    moveResponseExponent: number;
    airControlRatio: number;
    coyoteTimeSeconds: number;
    jumpBufferSeconds: number;
    variableJumpHoldSeconds: number;
    jumpHoldGravityRatio: number;
    jumpReleaseGravityRatio: number;
  };
  /**
   * Compiler-locked Feel surfaces the Runtime may switch among. Copied from
   * Registry at compile time; the Runtime never reverse-reads the Registry.
   */
  availableControlFeels: readonly ExecutionSubjectV3["controlFeel"][];
  capabilityAssembly?: ExecutionSubjectCapabilityAssemblyV1;
}

interface ExecutionCameraCore {
  cameraEntityId: string;
  rigRef: "worldkit://camera/third-person.standard@1";
  targetEntityId: string;
  pitchRadians: number;
  distanceMeters: number;
  targetHeightMeters: number;
  fovDegrees: number;
  manualSwitchAllowed: boolean;
}

interface ExecutionLayoutAssertionBaseV1 {
  readonly constraintId: string;
  readonly evidenceEntityIds: readonly string[];
  readonly measurements: Readonly<Record<string, number | boolean | string>>;
  readonly tolerances: Readonly<Record<string, number>>;
}

export type ExecutionLayoutAssertionV1 = ExecutionLayoutAssertionBaseV1 &
  (
    | Readonly<{ kind: "inside-region" | "outside-region"; entityId: string; regionId: string; boundaryClearanceMeters: number }>
    | Readonly<{ kind: "distance-range"; entityId: string; referenceEntityId: string; minimumDistanceMeters: number; maximumDistanceMeters: number }>
    | Readonly<{ kind: "faces-entity"; facingEntityId: string; targetEntityId: string; maximumAngularDeviationDegrees: number }>
    | Readonly<{ kind: "supported-by"; supportedEntityId: string; supportingEntityId: string; maximumSupportGapMeters: number; minimumSupportRatio: number }>
    | (Readonly<{ kind: "minimum-clearance"; entityId: string; clearanceMeters: number }> &
        (Readonly<{ otherEntityIds: readonly string[]; semanticClassIds?: never }> |
          Readonly<{ semanticClassIds: readonly string[]; otherEntityIds?: never }>))
    | (Readonly<{ kind: "within-slope-limit"; terrainEntityId: string; maximumSlopeDegrees: number }> &
        (Readonly<{ entityId: string; routeId?: never }> |
          Readonly<{ routeId: string; entityId?: never }>))
    | Readonly<{ kind: "visible-in-camera-region"; visibleEntityId: string; cameraEntityId: string; screenRegionId: string; minimumVisibleRatio: number; minimumProjectedAreaRatio: number }>
  );

export interface ExecutionLayoutPlacementProvenanceV1 {
  readonly kind: "fixed" | "solved";
  readonly candidateId: string;
  readonly placementConstraintIds: readonly string[];
  readonly solverProfileRef: string;
  readonly layoutSolveReportHash: string;
}

export interface ExecutionLayoutPlacementV1 {
  readonly entityId: string;
  readonly transform: ExecutionTransformV3;
  readonly placementProvenance: ExecutionLayoutPlacementProvenanceV1;
}

export interface ExecutionLayoutRegionV1 {
  readonly id: string;
  readonly kind: "polygon-xz";
  readonly pointsMetersXZ: readonly Vec2[];
  readonly minimumHeightMeters?: number;
  readonly maximumHeightMeters?: number;
  readonly semanticClassId: string;
}

export interface ExecutionLayoutRouteV1 {
  readonly id: string;
  readonly kind: "polyline-xz";
  readonly pointsMetersXZ: readonly Vec2[];
  readonly widthMeters: number;
  readonly locomotionProfileRef: string;
}

export interface ExecutionLayoutScreenRegionV1 {
  readonly id: string;
  readonly kind: "rectangle-uv";
  readonly minimumUv: readonly [u: number, v: number];
  readonly maximumUv: readonly [u: number, v: number];
}

export interface ExecutionCameraV4 extends ExecutionCameraCore {
  readonly aspectRatio: number;
}

export interface ExecutionPlanV4 {
  readonly kind: "worldkit-execution-plan";
  readonly schemaVersion: 4;
  readonly id: string;
  readonly seed: number;
  readonly runtimeBackend: "babylon-havok";
  readonly normalizedWorldIrHash: string;
  readonly resourceLockHash: string;
  readonly coordinateSystem: "right-handed-y-up-minus-z-forward";
  readonly gravityMetersPerSecondSquaredXYZ: Vec3;
  readonly atmospherePreset: "clear-day" | "golden-hour" | "overcast" | "night";
  readonly terrain: ExecutionTerrainV3;
  readonly waters: readonly ExecutionWaterV3[];
  readonly objects: readonly ExecutionObjectV3[];
  readonly subjectAssets: readonly ExecutionSubjectAssetV1[];
  readonly rigProfiles: readonly ExecutionRigProfileV1[];
  readonly animationSets: readonly ExecutionAnimationSetV1[];
  readonly colliderProfiles: readonly ExecutionColliderProfileV1[];
  readonly controlledEntityId: string;
  readonly subjects: readonly ExecutionSubjectV3[];
  readonly camera: ExecutionCameraV4;
  readonly resourceUsage: Readonly<{
    vertices: number;
    triangles: number;
    colliders: number;
  }>;
  readonly layout: Readonly<{
    solverProfileRef: string;
    resolvedVersion: string;
    solverProfileHash: string;
    layoutSolveReportHash: string;
    regions: readonly ExecutionLayoutRegionV1[];
    routes: readonly ExecutionLayoutRouteV1[];
    screenRegions: readonly ExecutionLayoutScreenRegionV1[];
    placementsByEntityId: Readonly<Record<string, ExecutionLayoutPlacementV1>>;
    layoutAssertions: readonly ExecutionLayoutAssertionV1[];
  }>;
}

export interface CompileWorldResultV4 {
  readonly ok: boolean;
  readonly executionPlan?: ExecutionPlanV4;
  readonly executionPlanHash?: string;
  readonly diagnostics: readonly CompileDiagnostic[];
}
