import type { SubjectResourceRegistryV2 } from "@whitebox-world/subject-registry";

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

export interface SubjectNodeSpecV2 {
  id: string;
  kind: "subject";
  subjectDefinitionRef: string;
  spawnAnchorEntityId?: string;
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

export interface SubjectVisualPartSpecV1 {
  id: string;
  kind: "primitive";
  shape: SubjectPrimitiveShapeSpecV1;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ?: Vec3;
  };
  colliderContribution: "include" | "exclude";
  semanticTags?: readonly string[];
}

export interface SubjectSocketSpecV1 {
  id: string;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ?: Vec3;
  };
  semanticTags: readonly string[];
}

export interface PackageSubjectDefinitionV1 {
  id: string;
  version: 1;
  kind: "subject-definition";
  category: "human" | "animal" | "custom";
  bodyTopology: "biped" | "quadruped" | "custom";
  semanticClassId: string;
  coordinateConvention: {
    forwardAxis: "-Z";
    upAxis: "+Y";
    metersPerUnit: 1;
    pivot: "support-center";
  };
  visualParts: readonly SubjectVisualPartSpecV1[];
  sockets: readonly SubjectSocketSpecV1[];
  colliderPolicy: {
    kind: "derive";
    colliderDerivationProfileRef: string;
  };
  capabilityRefs: readonly string[];
  profiles: {
    physicsBodyProfileRef: string;
    locomotionProfileRef: string;
  };
  aiMetadata: {
    displayName: string;
    description: string;
    semanticTags: readonly string[];
  };
}

export interface RelationshipSpecV1 {
  id: string;
  type: string;
  schemaVersion: 1;
}

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

export interface AuthoringSpecV2 {
  kind: "worldkit-authoring-spec";
  schemaVersion: 2;
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
  nodes: readonly WorldNodeSpecV2[];
  relationships: readonly RelationshipSpecV1[];
  rules: readonly RuleSpecV1[];
  startup: {
    spawnAnchorEntityId: string;
    controlledEntityId: string;
    cameraEntityId: string;
  };
  constraints: Record<string, never>;
}

export interface NormalizeAuthoringOptions {
  subjectResourceRegistry?: SubjectResourceRegistryV2;
}

export interface NormalizeAuthoringResult
  extends AuthoringResult<NormalizedWorldIRV2> {
  normalizedWorldIrHash?: string;
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

export interface NormalizedSubjectVisualPartV2 {
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

export interface NormalizedSubjectSocketV2 {
  id: string;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

export interface NormalizedSubjectDefinitionV2 {
  subjectDefinitionRef: string;
  subjectDefinitionHash: string;
  source: "package" | "registry";
  id: string;
  version: number;
  kind: "subject-definition";
  category: "human" | "animal" | "custom";
  bodyTopology: "biped" | "quadruped" | "custom";
  semanticClassId: string;
  coordinateConvention: PackageSubjectDefinitionV1["coordinateConvention"];
  visualParts: readonly NormalizedSubjectVisualPartV2[];
  sockets: readonly NormalizedSubjectSocketV2[];
  colliderPolicy: {
    kind: "derive";
    colliderDerivationProfileRef: string;
  };
  capabilityRefs: readonly string[];
  profiles: {
    physicsBodyProfileRef: string;
    locomotionProfileRef: string;
  };
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
  resourceCost: {
    vertices: number;
    triangles: number;
    colliders: 1;
  };
  aiMetadata: PackageSubjectDefinitionV1["aiMetadata"];
}

export type ResolvedResourceKindV1 =
  | "subject-definition"
  | "capability"
  | "physics-body-profile"
  | "locomotion-profile"
  | "collider-derivation-profile";

export interface ResolvedResourceLockEntryV1 {
  resourceRef: string;
  resourceKind: ResolvedResourceKindV1;
  resolvedVersion: string;
  contentHash: string;
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

export interface NormalizedWorldIRV2 {
  kind: "worldkit-normalized-world";
  schemaVersion: 2;
  id: string;
  seed: number;
  provenance?: AuthoringSpecV2["provenance"];
  world: AuthoringSpecV2["world"];
  resources: {
    prototypes: readonly PrimitivePrototypeSpecV2[];
    subjectDefinitions: readonly NormalizedSubjectDefinitionV2[];
    resourceLock: readonly ResolvedResourceLockEntryV1[];
    resourceLockHash: string;
  };
  nodes: readonly NormalizedWorldNodeV2[];
  startup: AuthoringSpecV2["startup"];
}
