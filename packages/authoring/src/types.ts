import type { Sha256HashV1 } from "@whitebox-world/protocol";
import type { JumpVariantPolicyV1 } from "@whitebox-world/runtime-contracts";
import type {
  AutomaticLocomotionPresentationKeyV1,
  BipedBoneIdV1,
  GroundHumanoidActionIdV1,
  HumanoidAnimationSemanticFamilyV1,
  SubjectBodyTopologyV2,
  SubjectResourceKindV1,
} from "@whitebox-world/subject-contracts";
import type {
  CameraContextProfileV1,
  CameraModifierProfileV1,
  CameraRigAlgorithmDefinitionV1,
  CameraRigProfileV1,
  ControlProfileV1,
  HarnessProfileV1,
  MediumProfileV1,
  MotionKernelDefinitionV1,
  MotionProfileV1,
  RelationshipProfileV1,
  RenderBindingProfileV1,
  SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";

export type Vec2 = readonly [x: number, z: number];
export type Vec3 = readonly [x: number, y: number, z: number];

export interface AuthoringSuggestion {
  kind: string;
  [key: string]: unknown;
}

export interface AuthoringDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  instancePath: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
  suggestions?: readonly AuthoringSuggestion[];
}

export interface AuthoringResult<T> {
  ok: boolean;
  value?: T;
  diagnostics: readonly AuthoringDiagnostic[];
}

export interface TransformSpecV2 {
  positionMetersXYZ: Vec3;
  rotationEulerRadiansXYZ?: Vec3;
  scaleXYZ?: Vec3;
}

export interface PrototypeTraversalSurfaceBindingV1 {
  readonly id: string;
  readonly kind: "collider-subshape";
  readonly logicalSubshapeId: string;
  readonly traversalSurfaceProfileRef: string;
}

interface PrimitivePrototypeBaseV2 {
  id: string;
  version: 1;
  kind: "primitive";
  collisionEnabled: boolean;
  semantic?: { classId: string };
}

export type PrimitivePrototypeSpecV2 =
  | (PrimitivePrototypeBaseV2 & { primitive: "box"; sizeMetersXYZ: Vec3 })
  | (PrimitivePrototypeBaseV2 & { primitive: "sphere"; radiusMeters: number })
  | (PrimitivePrototypeBaseV2 & {
      primitive: "cylinder" | "cone";
      radiusMeters: number;
      heightMeters: number;
    });

export interface ProceduralTerrainSourceSpecV2 {
  kind: "procedural";
  relief: "flat" | "plain" | "hills" | "mountains";
  baseHeightMeters?: number;
  amplitudeMeters?: number;
  frequencyPerMeter?: number;
  octaves?: number;
  lacunarityRatio?: number;
  persistenceRatio?: number;
}

export interface TerrainNodeSpecV2 {
  id: string;
  kind: "terrain";
  components: {
    terrain: {
      source: ProceduralTerrainSourceSpecV2;
      grid: {
        centerMetersXZ: Vec2;
        sizeMetersXZ: Vec2;
        resolutionCellsXZ: readonly [columns: number, rows: number];
        heightSamplesMeters?: readonly number[];
      };
      semantic?: { classId: string };
    };
  };
}

export type WaterBoundarySpecV2 =
  | { kind: "circle"; centerMetersXZ: Vec2; radiusMeters: number }
  | { kind: "ellipse"; centerMetersXZ: Vec2; radiusMetersXZ: Vec2 }
  | { kind: "polygon"; pointsMetersXZ: readonly Vec2[] };

export interface WaterNodeSpecV2 {
  id: string;
  kind: "water";
  components: {
    water: {
      terrainEntityId: string;
      boundary: WaterBoundarySpecV2;
      depthMeters: number;
      shoreWidthMeters?: number;
      waterLevelMeters?: number;
      traversalMode?: "blocked" | "swimmable" | "walkable";
      semantic?: { classId: string };
    };
  };
}

export interface ObjectNodeSpecV2 {
  id: string;
  kind: "object";
  prototypeRef: string;
  transform: TransformSpecV2;
}

export const FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1 = [
  "profiles.controlFeelProfileRef",
  "profiles.controlProfileRef",
  "profiles.motion.defaultMotionProfileRef",
] as const;

export type FirstBatchAllowedOverridePathV1 =
  (typeof FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1)[number];

export interface DefinitionResourceRefOverrideV1 {
  readonly id: string;
  readonly kind: "resource-ref";
  readonly path: string;
  readonly resourceRef: string;
}

export interface SubjectNodeSpecV2 {
  id: string;
  kind: "subject";
  subjectDefinitionRef: string;
  spawnAnchorEntityId?: string;
  overrides?: readonly DefinitionResourceRefOverrideV1[];
}

export interface CameraNodeSpecV2 {
  id: string;
  kind: "camera";
  components: {
    cameraRig: {
      defaultRigRef: string;
      allowedRigRefs: readonly string[];
      target: {
        targetEntityId: string;
        targetHeightMeters?: number;
      };
      thirdPerson: {
        pitchRadians: number;
        distanceMeters: number;
        targetHeightMeters: number;
        fovDegrees: number;
      };
      manualSwitchAllowed: boolean;
    };
  };
}

export interface AnchorNodeSpecV2 {
  id: string;
  kind: "anchor";
  transform: TransformSpecV2;
  semantic: { classId: string };
}

export type SubjectPrimitiveShapeSpecV1 =
  | { kind: "box"; sizeMetersXYZ: Vec3 }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder"; radiusMeters: number; heightMeters: number }
  | { kind: "capsule"; radiusMeters: number; heightMeters: number };

export interface SubjectLocalTransformSpecV1 {
  positionMetersXYZ: Vec3;
  rotationEulerRadiansXYZ?: Vec3;
}

export type SubjectVisualPartSpecV2 =
  | {
      id: string;
      kind: "primitive";
      shape: SubjectPrimitiveShapeSpecV1;
      localTransform: SubjectLocalTransformSpecV1;
      colliderContribution: "include" | "exclude";
      semanticTags: readonly string[];
    }
  | {
      id: string;
      kind: "asset";
      subjectAssetRef: string;
      localTransform: SubjectLocalTransformSpecV1 & { scaleXYZ: Vec3 };
      appearance: { mode: "whitebox-neutral" };
      semanticTags: readonly string[];
    };

export type SubjectVisualBindingV1 =
  | { mode: "static" }
  | {
      mode: "rigged";
      rigProfileRef: string;
      animationSetRef: string;
    };

/** Shape proposal; executable profiles remain the Host's responsibility. */
export interface ComposedSubjectDesignV1 {
  id: string;
  category: PackageSubjectDefinitionV1["category"];
  bodyTopology: PackageSubjectDefinitionV1["bodyTopology"];
  semanticClassId: string;
  displayName: string;
  description: string;
  visualParts: readonly (
    | Extract<SubjectVisualPartSpecV2, { kind: "primitive" }>
    | Omit<Extract<SubjectVisualPartSpecV2, { kind: "asset" }>, "appearance">
  )[];
  visualBinding:
    | { mode: "static" }
    | { mode: "rigged"; rigProfileRef: string; animationSetRef: string; colliderProfileRef: string };
}

export type SubjectDesignV1 =
  | { kind: "registered"; subjectDefinitionRef: string }
  | { kind: "composed"; definition: ComposedSubjectDesignV1 };

export type SubjectColliderPolicyV2 =
  | {
      kind: "derive";
      colliderDerivationProfileRef: string;
    }
  | {
      kind: "profile";
      colliderProfileRef: string;
    };

export type SubjectSocketSpecV2 =
  | {
      id: string;
      kind: "local";
      localTransform: SubjectLocalTransformSpecV1;
      semanticTags: readonly string[];
    }
  | {
      id: string;
      kind: "bone";
      boneId: BipedBoneIdV1;
      offsetTransform: SubjectLocalTransformSpecV1;
      semanticTags: readonly string[];
    };

export interface PackageSubjectDefinitionV1 {
  id: string;
  version: 1;
  kind: "subject-definition";
  authoringAvailability: "recommended" | "advanced" | "experimental";
  category: "human" | "animal" | "custom";
  bodyTopology: "biped" | "quadruped" | "custom";
  semanticClassId: string;
  coordinateConvention: {
    forwardAxis: "-Z";
    upAxis: "+Y";
    metersPerUnit: 1;
    pivot: "support-center";
  };
  visualParts: readonly SubjectVisualPartSpecV2[];
  visualBinding: SubjectVisualBindingV1;
  sockets: readonly SubjectSocketSpecV2[];
  mountSlots: readonly SubjectMountSlotDefinitionV1[];
  colliderPolicy: SubjectColliderPolicyV2;
  capabilityRefs: readonly string[];
  profiles: {
    physicsBodyProfileRef: string;
    locomotionProfileRef: string;
    controlFeelProfileRef: string;
    allowedControlFeelProfileRefs: readonly string[];
    motion: {
      defaultMotionProfileRef: string;
      optionalMotionProfileRefs: readonly string[];
      fallbackMotionProfileRef: string;
    };
    controlProfileRef: string;
    cameraContextProfileRef: string;
    mediumProfileRef: string;
    harnessProfileRef: string;
  };
  relationshipCapabilityRefs: readonly string[];
  actionOrPoseSetRef: string;
  renderBindingProfileRef: string;
  allowedOverridePaths: readonly string[];
  aiMetadata: {
    displayName: string;
    description: string;
    semanticTags: readonly string[];
  };
}

export interface SubjectMountSlotDefinitionV1 {
  readonly id: string;
  readonly kind: "mount-slot";
  readonly mode: "stand";
  readonly mountSocketId: string;
  readonly riderSubjectOriginOffsetMetersXYZ: Vec3;
  readonly dismountCandidateOffsetsMetersXYZ: readonly Vec3[];
}

export interface MountedOnRelationshipSpecV1 {
  readonly id: string;
  readonly type: "mountedOn";
  readonly schemaVersion: 1;
  readonly riderEntityId: string;
  readonly mountEntityId: string;
  readonly mountSlotId: string;
}

export type RelationshipSpecV1 = MountedOnRelationshipSpecV1;

export interface RuleSpecV1 {
  id: string;
  kind: string;
}

export type WorldNodeSpecV2 =
  | TerrainNodeSpecV2
  | WaterNodeSpecV2
  | ObjectNodeSpecV2
  | SubjectNodeSpecV2
  | CameraNodeSpecV2
  | AnchorNodeSpecV2;

export interface AuthoringDocumentBase {
  kind: "worldkit-authoring-spec";
  id: string;
  seed: number;
  provenance?: {
    userPrompt?: string;
    referenceImages?: readonly {
      assetRef: string;
      evidenceClass: "user-explicit" | "reference-visible" | "planner-inferred";
    }[];
  };
  world: {
    coordinateSystem: "right-handed-y-up-minus-z-forward";
    bounds: {
      centerMetersXZ: Vec2;
      sizeMetersXZ: Vec2;
      heightRangeMeters: readonly [minimum: number, maximum: number];
    };
    gravityMetersPerSecondSquaredXYZ: Vec3;
    environment: {
      preset: "clear-day" | "golden-hour" | "overcast" | "night";
    };
    resourceBudget: {
      maxVertices: number;
      maxTriangles: number;
      maxColliders: number;
    };
  };
  resources: {
    prototypes: readonly PrimitivePrototypeSpecV2[];
    subjectDefinitions: readonly PackageSubjectDefinitionV1[];
  };
  relationships: readonly RelationshipSpecV1[];
  rules: readonly RuleSpecV1[];
  startup: {
    spawnAnchorEntityId: string;
    controlledEntityId: string;
    cameraEntityId: string;
  };
}

export interface NormalizeAuthoringOptions {
  subjectResourceRegistry?: SubjectResourceRegistryV3;
}

export interface NormalizeAuthoringBaseResult
  extends AuthoringResult<NormalizedWorldBase> {
  normalizedWorldIrHash?: Sha256HashV1;
}

export interface NormalizedTransformV2 {
  positionMetersXYZ: Vec3;
  rotationEulerRadiansXYZ: Vec3;
  scaleXYZ: Vec3;
}

export interface NormalizedProceduralTerrainSourceV2 {
  kind: "procedural";
  relief: ProceduralTerrainSourceSpecV2["relief"];
  baseHeightMeters: number;
  amplitudeMeters: number;
  frequencyPerMeter: number;
  octaves: number;
  lacunarityRatio: number;
  persistenceRatio: number;
}

export type NormalizedSubjectVisualPartV2 =
  | {
      id: string;
      kind: "primitive";
      shape: SubjectPrimitiveShapeSpecV1;
      localTransform: {
        positionMetersXYZ: Vec3;
        rotationEulerRadiansXYZ: Vec3;
      };
      colliderContribution: "include" | "exclude";
      semanticTags: readonly string[];
    }
  | {
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
    };

export type NormalizedSubjectSocketV2 =
  | {
      id: string;
      kind: "local";
      localTransform: {
        positionMetersXYZ: Vec3;
        rotationEulerRadiansXYZ: Vec3;
      };
      semanticTags: readonly string[];
    }
  | {
      id: string;
      kind: "bone";
      boneId: BipedBoneIdV1;
      offsetTransform: {
        positionMetersXYZ: Vec3;
        rotationEulerRadiansXYZ: Vec3;
      };
      semanticTags: readonly string[];
    };

export interface NormalizedSubjectColliderV2 {
  kind: "capsule";
  radiusMeters: number;
  heightMeters: number;
  centerOffsetFromSubjectOriginMetersXYZ: Vec3;
}

export interface NormalizedSubjectAssetInventoryV1 {
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  skeletonCount: number;
  boneCount: number;
  animationClipNames: readonly string[];
}

export interface NormalizedSubjectAssetV1 {
  subjectAssetRef: string;
  subjectAssetManifestHash: string;
  artifactContentHash: string;
  byteLength: number;
  mediaType: "model/gltf-binary";
  format: "glb";
  inventory: NormalizedSubjectAssetInventoryV1;
}

export interface NormalizedRigProfileV1 {
  rigProfileRef: string;
  bodyTopology: "biped";
  skeletonRootBoneName: string;
  requiredBoneIds: readonly BipedBoneIdV1[];
  sourceNodeNameByBoneId: Readonly<Record<BipedBoneIdV1, string>>;
}

export interface NormalizedAnimationBindingV1 {
  actionId: GroundHumanoidActionIdV1;
  sourceClipName: string;
  semanticFamily: HumanoidAnimationSemanticFamilyV1;
  automaticPresentationKeys: readonly AutomaticLocomotionPresentationKeyV1[];
  loopMode: "repeat" | "once";
  playbackSpeedRatio: number;
  blendDurationSeconds: number;
  rootMotionMode: "in-place";
}

export interface NormalizedAnimationSetV1 {
  animationSetRef: string;
  subjectAssetRef: string;
  rigProfileRef: string;
  defaultActionId: GroundHumanoidActionIdV1;
  requiredActionIds: readonly GroundHumanoidActionIdV1[];
  animationBindings: readonly NormalizedAnimationBindingV1[];
}

export interface NormalizedColliderProfileV1 {
  colliderProfileRef: string;
  supportedBodyTopologies: readonly SubjectBodyTopologyV2[];
  collider: NormalizedSubjectColliderV2;
}

export interface NormalizedSubjectDefinitionV2 {
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  source: "package" | "registry";
  id: string;
  version: number;
  kind: "subject-definition";
  category: "human" | "animal" | "vehicle" | "composite" | "custom";
  bodyTopology: SubjectBodyTopologyV2;
  semanticClassId: string;
  coordinateConvention: PackageSubjectDefinitionV1["coordinateConvention"];
  visualParts: readonly NormalizedSubjectVisualPartV2[];
  visualBinding: SubjectVisualBindingV1;
  sockets: readonly NormalizedSubjectSocketV2[];
  mountSlots: readonly SubjectMountSlotDefinitionV1[];
  colliderPolicy: SubjectColliderPolicyV2;
  capabilityRefs: readonly string[];
  locomotionCapabilityRef: string;
  locomotionCapabilityHash: string;
  allowedOverridePaths: readonly string[];
  profiles: {
    physicsBodyProfileRef: string;
    locomotionProfileRef: string;
  };
  capabilityAssembly: {
    authoringAvailability: "recommended" | "advanced" | "experimental";
    physicsBodyProfileRef: string;
    locomotionProfileRef: string;
    defaultMotionProfile: MotionProfileV1;
    optionalMotionProfiles: readonly MotionProfileV1[];
    fallbackMotionProfile: MotionProfileV1;
    motionKernels: readonly MotionKernelDefinitionV1[];
    controlProfile: ControlProfileV1;
    cameraContextProfile: CameraContextProfileV1;
    cameraRigProfiles: readonly CameraRigProfileV1[];
    cameraModifierProfiles: readonly CameraModifierProfileV1[];
    cameraRigAlgorithms: readonly CameraRigAlgorithmDefinitionV1[];
    mediumProfile: MediumProfileV1;
    relationshipProfiles: readonly RelationshipProfileV1[];
    harnessProfile: HarnessProfileV1;
    renderBindingProfile: RenderBindingProfileV1;
    actionOrPoseSetRef: string;
  };
  collider: NormalizedSubjectColliderV2 & {
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
    jumpVariantPolicy: JumpVariantPolicyV1;
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
   * First-slice Feel surfaces locked from the Registry at normalize time so the
   * Runtime can switch Feel without reverse-reading the Registry.
   */
  availableControlFeels: readonly NormalizedSubjectDefinitionV2["controlFeel"][];
  resourceCost: {
    vertices: number;
    triangles: number;
    colliders: 1;
  };
  aiMetadata: PackageSubjectDefinitionV1["aiMetadata"];
}

export type ResolvedResourceKindV1 =
  | SubjectResourceKindV1
  | "traversal-surface-profile";

export interface ResolvedResourceLockEntryV1 {
  resourceRef: string;
  resourceKind: ResolvedResourceKindV1;
  resolvedVersion: string;
  contentHash: string;
}

export interface NormalizedWorldResourcesV2 {
  prototypes: readonly PrimitivePrototypeSpecV2[];
  subjectDefinitions: readonly NormalizedSubjectDefinitionV2[];
  subjectAssets: readonly NormalizedSubjectAssetV1[];
  rigProfiles: readonly NormalizedRigProfileV1[];
  animationSets: readonly NormalizedAnimationSetV1[];
  colliderProfiles: readonly NormalizedColliderProfileV1[];
  resourceLock: readonly ResolvedResourceLockEntryV1[];
  resourceLockHash: string;
}

export type NormalizedWorldNodeV2 =
  | (Omit<TerrainNodeSpecV2, "components"> & {
      components: {
        terrain: Omit<TerrainNodeSpecV2["components"]["terrain"], "source"> & {
          source: NormalizedProceduralTerrainSourceV2;
        };
      };
    })
  | (Omit<WaterNodeSpecV2, "components"> & {
      components: {
        water: Omit<
          WaterNodeSpecV2["components"]["water"],
          "shoreWidthMeters" | "traversalMode"
        > & {
          shoreWidthMeters: number;
          traversalMode: "blocked" | "swimmable" | "walkable";
        };
      };
    })
  | (Omit<ObjectNodeSpecV2, "transform"> & { transform: NormalizedTransformV2 })
  | (Omit<SubjectNodeSpecV2, "spawnAnchorEntityId"> & {
      spawnAnchorEntityId: string;
    })
  | CameraNodeSpecV2
  | (Omit<AnchorNodeSpecV2, "transform"> & {
      transform: NormalizedTransformV2;
    });

export interface NormalizedWorldBase {
  id: string;
  seed: number;
  provenance?: AuthoringDocumentBase["provenance"];
  world: AuthoringDocumentBase["world"];
  resources: NormalizedWorldResourcesV2;
  nodes: readonly NormalizedWorldNodeV2[];
  relationships: readonly MountedOnRelationshipSpecV1[];
  startup: AuthoringDocumentBase["startup"];
}
