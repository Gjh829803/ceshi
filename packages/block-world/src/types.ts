export type BlockPositionMetersXYZV2 = readonly [x: number, y: number, z: number];
export type BlockShapeKindV2 = "full" | "half" | "quarter" | "small";
export type BlockPresetRefV1 = `worldkit://block-preset/${string}@1`;
export type BlockSurfaceProfileRefV1 =
  `worldkit://block-surface-profile/${string}@1`;
export type BlockColorHexV1 = `#${string}`;

export type BlockPresetFamilyV1 = "functional" | "landmark";
export type BlockBodyModeV1 = "none" | "static" | "kinematic";
export type BlockCollisionModeV1 = "none" | "solid" | "trigger";
export type BlockSupportSurfaceModeV1 = "none" | "ground" | "cloud";
export type BlockMediumModeV1 = "none" | "solid" | "water" | "cloud";
export type BlockInteractionModeV1 = "none" | "solid" | "trigger";

export interface BlockGroundSurfaceMotionResponseV1 {
  readonly maximumSpeedRatio: number;
  readonly accelerationRatio: number;
  readonly decelerationRatio: number;
}

export interface BlockSurfaceProfileDefinitionV1 {
  readonly resourceRef: BlockSurfaceProfileRefV1;
  readonly physics: Readonly<{
    frictionRatio: number;
    restitutionRatio: number;
  }>;
  readonly groundedMotion: BlockGroundSurfaceMotionResponseV1;
  readonly aiMetadata: Readonly<{
    displayName: string;
    description: string;
    semanticTags: readonly string[];
  }>;
}

export interface BlockPresetDefinitionV1 {
  readonly resourceRef: BlockPresetRefV1;
  readonly family: BlockPresetFamilyV1;
  readonly render: Readonly<{ colorHex: BlockColorHexV1; opacityRatio: number }>;
  readonly physics: Readonly<{
    bodyMode: BlockBodyModeV1;
    collisionMode: BlockCollisionModeV1;
  }>;
  readonly surfaceProfileRef: BlockSurfaceProfileRefV1 | null;
  readonly traversal: Readonly<{
    supportSurfaceMode: BlockSupportSurfaceModeV1;
    mediumMode: BlockMediumModeV1;
  }>;
  readonly interactionMode: BlockInteractionModeV1;
}

export interface BlockInstanceV2 {
  readonly id: string;
  readonly presetRef: string;
  readonly shape: BlockShapeKindV2;
  readonly positionMetersXYZ: BlockPositionMetersXYZV2;
  readonly rotationQuarterTurnsY: number;
  readonly visualGroupId?: string;
  readonly interactionInstanceId?: string;
  readonly initialStateId?: string;
}

export interface BlockWorldManifestV2 {
  readonly kind: "worldkit-block-world-manifest";
  readonly schemaVersion: 2;
  readonly fullBlockSizeMetersXYZ: readonly [1, 1, 1];
  readonly microGridSizeMetersXYZ: readonly [0.5, 0.5, 0.5];
  readonly blocks: readonly BlockInstanceV2[];
}

export interface BlockSubjectTraversalProfileV2 {
  readonly clearanceHeightMeters: number;
  readonly footprintRadiusMetersXZ: number;
  readonly maximumStepUpMeters: number;
  readonly maximumStepDownMeters: number;
  readonly maximumAutoSmoothHeightDeltaMeters: 1;
  readonly maximumAdjacentWalkableHeightDeltaMeters: 2;
  readonly canStandOnCloud: boolean;
}

export interface BlockWorldIdentityV2 {
  readonly id: string;
  readonly seed: number;
}

export type BlockSubjectPrimitiveShapeV2 =
  | Readonly<{ kind: "box"; sizeMetersXYZ: readonly [number, number, number] }>
  | Readonly<{ kind: "sphere"; radiusMeters: number }>
  | Readonly<{ kind: "cylinder" | "capsule"; radiusMeters: number; heightMeters: number }>;

export type BlockSubjectVisualPartV2 =
  | Readonly<{
      id: string;
      kind: "primitive";
      shape: BlockSubjectPrimitiveShapeV2;
      positionMetersXYZ: readonly [number, number, number];
      rotationEulerRadiansXYZ?: readonly [number, number, number];
      colliderContribution: "include" | "exclude";
      semanticTags: readonly string[];
    }>
  | Readonly<{
      id: string;
      kind: "asset";
      subjectAssetRef: string;
      positionMetersXYZ: readonly [number, number, number];
      rotationEulerRadiansXYZ?: readonly [number, number, number];
      scaleXYZ: readonly [number, number, number];
      semanticTags: readonly string[];
    }>;

export type BlockSubjectBodyTopologyV2 =
  | "biped"
  | "quadruped"
  | "four-wheel"
  | "surface-craft"
  | "watercraft"
  | "glider"
  | "composite"
  | "custom";

export type BlockSubjectCategoryV2 =
  | "human"
  | "animal"
  | "vehicle"
  | "composite"
  | "custom";

export type BlockMotionPackIdV1 =
  | "ground.character-standard"
  | "ground.root-standard"
  | "flight.powered-standard";

export type BlockCameraPackIdV1 =
  | "third-person.standard"
  | "third-person.over-shoulder"
  | "third-person.giant"
  | "first-person.standard";

export type BlockLocomotionPresentationKeyV1 =
  | "locomotion.suspended"
  | "locomotion.idle"
  | "locomotion.walk"
  | "locomotion.run"
  | "locomotion.takeoff"
  | "locomotion.rising"
  | "locomotion.apex"
  | "locomotion.falling"
  | "locomotion.landing";

export type BlockSubjectPresentationPolicyV1 =
  | Readonly<{ kind: "automatic" }>
  | Readonly<{
      kind: "fixed-locomotion";
      presentationKey: BlockLocomotionPresentationKeyV1;
    }>;

export type BlockSubjectAssemblyBaseV1 =
  | Readonly<{
      kind: "subject-pack";
      subjectPackId: string;
    }>
  | Readonly<{
      kind: "custom-mesh";
      subjectMeshBindingIds: readonly string[];
      category: BlockSubjectCategoryV2;
      bodyTopology: BlockSubjectBodyTopologyV2;
      semanticClassId: string;
      displayName: string;
      description: string;
    }>;

export interface BlockSubjectAssemblyDefinitionV1 {
  readonly id: string;
  readonly baseSubject: BlockSubjectAssemblyBaseV1;
  readonly attachments: readonly Readonly<{ subjectMeshBindingId: string }>[];
  readonly motion: Readonly<{ motionPackId: BlockMotionPackIdV1 }>;
  readonly presentation: BlockSubjectPresentationPolicyV1;
}

export interface BlockComposedSubjectDefinitionV2 {
  readonly id: string;
  readonly category: "human" | "animal" | "custom";
  readonly bodyTopology: "biped" | "quadruped" | "custom";
  readonly semanticClassId: string;
  readonly displayName: string;
  readonly description: string;
  readonly visualParts: readonly BlockSubjectVisualPartV2[];
  readonly visualBinding:
    | Readonly<{ kind: "static" }>
    | Readonly<{
        kind: "rigged";
        rigProfileRef: string;
        animationSetRef: string;
        colliderProfileRef: string;
      }>;
}

interface BlockWorldControlledSubjectBaseV2 {
  readonly entityId: string;
  readonly visualTargetId: string;
  readonly yawQuarterTurnsY: number;
}

export type BlockWorldControlledSubjectV2 =
  | (BlockWorldControlledSubjectBaseV2 & Readonly<{
      kind: "registered";
      subjectDefinitionRef: string;
    }>)
  | (BlockWorldControlledSubjectBaseV2 & Readonly<{
      kind: "composed";
      definition: BlockComposedSubjectDefinitionV2;
    }>)
  | (BlockWorldControlledSubjectBaseV2 & Readonly<{
      kind: "assembly";
      assembly: BlockSubjectAssemblyDefinitionV1;
    }>);

export interface BlockWorldThirdPersonCameraV2 {
  readonly entityId: string;
  readonly pitchRadians: number;
  readonly distanceMeters: number;
  readonly targetHeightMeters: number;
  readonly fovDegrees: number;
  readonly aspectRatio: number;
}

export type BlockCameraTargetBindingV1 =
  | Readonly<{
      kind: "base-subject-socket";
      socketId: string;
    }>
  | Readonly<{
      kind: "base-subject-bounds";
      heightRatio: number;
    }>
  | Readonly<{
      kind: "assembly-bounds";
      heightRatio: number;
    }>
  | Readonly<{
      kind: "subject-local-point";
      positionMetersXYZ: BlockPositionMetersXYZV2;
    }>;

export interface BlockWorldPackCameraV1 {
  readonly kind: "pack";
  readonly entityId: string;
  readonly cameraPackId: BlockCameraPackIdV1;
  readonly target: BlockCameraTargetBindingV1;
  readonly tuning?: Readonly<{
    distanceMeters?: number;
    pitchRadians?: number;
    fovDegrees?: number;
  }>;
  readonly aspectRatio: number;
}

export type BlockWorldCameraV2 =
  | BlockWorldThirdPersonCameraV2
  | BlockWorldPackCameraV1;

export interface BlockRequiredTargetV2 {
  readonly id: string;
  readonly navigationRole: "middle" | "remote";
  readonly standPositionMetersXYZ: BlockPositionMetersXYZV2;
}

export interface BlockRequiredGroundTraversalBandV2 {
  readonly id: string;
  readonly centerlineStandPositionsMetersXYZ: readonly BlockPositionMetersXYZV2[];
  readonly halfWidthMeters: number;
  readonly isBidirectional: boolean;
}

export interface BlockVisualTargetFacingV2 {
  readonly visualTargetId: string;
  readonly frontYawQuarterTurnsY: number;
}

export interface BlockWorldSpaceTransitionV2 {
  readonly id: string;
  readonly kind: "door" | "portal";
  readonly triggerBlockId: string;
  readonly sourceStandPositionMetersXYZ: BlockPositionMetersXYZV2;
  readonly destinationStandPositionMetersXYZ: BlockPositionMetersXYZV2;
  readonly destinationYawQuarterTurnsY: number;
}

export type BlockWorldDiagnosticCodeV2 =
  | "BLOCK_ADJACENT_WALKABLE_HEIGHT_DELTA_EXCEEDED"
  | "BLOCK_BINDING_INVALID"
  | "BLOCK_INSTANCE_ID_DUPLICATE"
  | "BLOCK_INSTANCE_ID_INVALID"
  | "BLOCK_MATERIAL_INVALID"
  | "BLOCK_MESH_GEOMETRY_INVALID"
  | "BLOCK_MESH_POSITION_INVALID"
  | "BLOCK_MESH_ROTATION_INVALID"
  | "BLOCK_MESH_SCALE_INVALID"
  | "BLOCK_MESH_UNBOUND"
  | "BLOCK_OCCUPANCY_OVERLAP"
  | "BLOCK_POSITION_INVALID"
  | "BLOCK_PRESET_UNKNOWN"
  | "BLOCK_ROTATION_INVALID"
  | "BLOCK_SHAPE_INVALID"
  | "BLOCK_TARGET_ID_DUPLICATE"
  | "BLOCK_TARGET_ID_INVALID"
  | "BLOCK_TARGET_NAVIGATION_ROLE_INVALID"
  | "BLOCK_TARGET_POSITION_DUPLICATE"
  | "BLOCK_TRAVERSAL_PROFILE_INVALID"
  | "BLOCK_GROUND_TRAVERSAL_BAND_DISCONNECTED"
  | "BLOCK_GROUND_TRAVERSAL_BAND_ID_DUPLICATE"
  | "BLOCK_GROUND_TRAVERSAL_BAND_INVALID"
  | "BLOCK_GROUND_TRAVERSAL_BAND_WAYPOINT_NOT_STANDABLE"
  | "BLOCK_WORLD_SPACE_TRANSITION_DESTINATION_NOT_STANDABLE"
  | "BLOCK_WORLD_SPACE_TRANSITION_ID_DUPLICATE"
  | "BLOCK_WORLD_SPACE_TRANSITION_INVALID"
  | "BLOCK_WORLD_SPACE_TRANSITION_SOURCE_NOT_STANDABLE"
  | "BLOCK_WORLD_SPACE_TRANSITION_TRIGGER_INVALID"
  | "BLOCK_WORLD_CAMERA_INVALID"
  | "BLOCK_WORLD_IDENTITY_INVALID"
  | "BLOCK_WORLD_NO_STANDABLE_POSITIONS"
  | "BLOCK_WORLD_SPAWN_NOT_STANDABLE"
  | "BLOCK_WORLD_SUBJECT_INVALID"
  | "BLOCK_WORLD_SUBJECT_ASSEMBLY_INVALID"
  | "BLOCK_WORLD_SUBJECT_MESH_BINDING_DUPLICATE"
  | "BLOCK_WORLD_SUBJECT_MESH_BINDING_MISSING"
  | "BLOCK_WORLD_SUBJECT_MESH_GEOMETRY_INVALID"
  | "BLOCK_WORLD_SUBJECT_MESH_MATERIAL_INVALID"
  | "BLOCK_WORLD_SUBJECT_MESH_TRANSFORM_INVALID"
  | "BLOCK_WORLD_SUBJECT_PACK_UNKNOWN"
  | "BLOCK_WORLD_SUBJECT_PACK_INCOMPATIBLE"
  | "BLOCK_WORLD_SUBJECT_PRESENTATION_INCOMPATIBLE"
  | "BLOCK_WORLD_CAMERA_PACK_INCOMPATIBLE"
  | "BLOCK_WORLD_SUBJECT_SCALE_INVALID"
  | "BLOCK_WORLD_TARGET_NOT_STANDABLE"
  | "BLOCK_WORLD_TARGET_UNREACHABLE"
  | "BLOCK_VISUAL_TARGET_FACING_INVALID"
  | "BLOCK_VISUAL_TARGET_FACING_MISSING"
  | "BLOCK_VISUAL_TARGET_FACING_UNDECLARED"
  | "BLOCK_WORLD_WALKABLE_COMPONENT_DISCONNECTED"
  | "LANDMARK_BLOCK_VISUAL_GROUP_REQUIRED"
  | "LANDMARK_COLOR_REUSED"
  | "LANDMARK_GROUP_MIXED_COLORS";

export interface BlockWorldDiagnosticV2 {
  readonly severity: "error";
  readonly code: BlockWorldDiagnosticCodeV2;
  readonly instancePath: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface CheckBlockWorldInputV2 {
  readonly manifest: BlockWorldManifestV2;
  readonly world: BlockWorldIdentityV2;
  readonly controlledSubject: BlockWorldControlledSubjectV2;
  readonly camera: BlockWorldCameraV2;
  readonly subjectMeshParts?: readonly Extract<
    BlockSubjectVisualPartV2,
    { kind: "primitive" }
  >[];
  readonly subjectTraversalProfile: BlockSubjectTraversalProfileV2;
  readonly spawnStandPositionMetersXYZ: BlockPositionMetersXYZV2;
  readonly requiredTargets: readonly BlockRequiredTargetV2[];
  readonly requiredGroundTraversalBands: readonly BlockRequiredGroundTraversalBandV2[];
  readonly visualTargetFacings: readonly BlockVisualTargetFacingV2[];
  readonly spaceTransitions: readonly BlockWorldSpaceTransitionV2[];
  readonly requireSingleReachableComponent: boolean;
  readonly sourceDiagnostics?: readonly BlockWorldDiagnosticV2[];
}

export interface BlockWorldCheckMetricsV2 {
  readonly blockCount: number;
  readonly blockCountByShape: Readonly<Record<BlockShapeKindV2, number>>;
  readonly standablePositionCount: number;
  readonly reachablePositionCount: number;
  readonly disconnectedStandablePositionCount: number;
  readonly requiredTargetCount: number;
  readonly reachableRequiredTargetCount: number;
  readonly requiredTargetCountByNavigationRole: Readonly<{
    middle: number;
    remote: number;
  }>;
  readonly reachableRequiredTargetCountByNavigationRole: Readonly<{
    middle: number;
    remote: number;
  }>;
  readonly requiredGroundTraversalBandCount: number;
  readonly reachableRequiredGroundTraversalBandCount: number;
  readonly reachableStandPositionBoundsMeters: Readonly<{
    minimumMetersXYZ: BlockPositionMetersXYZV2;
    maximumMetersXYZ: BlockPositionMetersXYZV2;
  }> | null;
  readonly reachableHorizontalSpanMetersXZ: readonly [number, number];
  readonly reachableChunkCount: number;
  readonly maximumReachableDistanceMeters: number;
  readonly offCameraReachablePositionCount: number;
  readonly offCameraReachableChunkCount: number;
  readonly smoothedWalkableEdgeCount: number;
  readonly spaceTransitionCount: number;
  readonly reachableSpaceTransitionCount: number;
}

export interface BlockWorldCheckReportV2 {
  readonly kind: "worldkit-block-world-check-report";
  readonly schemaVersion: 2;
  readonly status: "passed" | "failed";
  readonly diagnostics: readonly BlockWorldDiagnosticV2[];
  readonly metrics: BlockWorldCheckMetricsV2;
}
