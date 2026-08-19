import type {
  SubjectDefinitionRegistryV1,
  SubjectKitDefinitionV1,
} from "@whitebox-world/subject-registry";

export type Vec2 = readonly [x: number, y: number];
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

export interface NormalizeAuthoringResult extends AuthoringResult<NormalizedWorldIRV1> {
  normalizedWorldIrHash?: string;
}

export interface NormalizeAuthoringOptionsV1 {
  subjectDefinitionRegistry?: SubjectDefinitionRegistryV1;
}

export interface TransformSpecV1 {
  positionMeters: Vec3;
  rotationEulerRadiansXYZ?: Vec3;
  scaleXYZ?: Vec3;
}

export interface PrimitivePrototypeSpecV1 {
  id: string;
  version: 1;
  kind: "primitive";
  primitive: "box" | "sphere" | "cylinder" | "cone";
  sizeMetersXYZ?: Vec3;
  radiusMeters?: number;
  heightMeters?: number;
  collisionEnabled: boolean;
  semantic?: { classId: string };
}

export interface ProceduralTerrainSourceSpecV1 {
  kind: "procedural";
  relief: "flat" | "plain" | "hills" | "mountains";
  baseHeightMeters?: number;
  amplitudeMeters?: number;
  frequencyPerMeter?: number;
  octaves?: number;
  lacunarityRatio?: number;
  persistenceRatio?: number;
}

export interface TerrainNodeSpecV1 {
  id: string;
  kind: "terrain";
  components: {
    terrain: {
      source: ProceduralTerrainSourceSpecV1;
      grid: {
        centerXZ: Vec2;
        sizeXZ: Vec2;
        resolutionXZ: readonly [columns: number, rows: number];
      };
      semantic?: { classId: string };
    };
  };
}

export type WaterBoundarySpecV1 =
  | { kind: "circle"; centerXZ: Vec2; radiusMeters: number }
  | { kind: "ellipse"; centerXZ: Vec2; radiusMetersXZ: Vec2 }
  | { kind: "polygon"; pointsXZ: readonly Vec2[] };

export interface WaterNodeSpecV1 {
  id: string;
  kind: "water";
  components: {
    water: {
      terrainEntityId: string;
      boundary: WaterBoundarySpecV1;
      depthMeters: number;
      shoreWidthMeters?: number;
      waterLevelMeters?: number;
      traversalMode?: "blocked" | "swimmable" | "walkable";
      semantic?: { classId: string };
    };
  };
}

export interface ObjectNodeSpecV1 {
  id: string;
  kind: "object";
  prototypeRef: string;
  transform: TransformSpecV1;
}

export interface SubjectNodeSpecV1 {
  id: string;
  kind: "subject";
  kitRef: string;
  spawnAnchorEntityId?: string;
}

export interface CameraNodeSpecV1 {
  id: string;
  kind: "camera";
  components: {
    cameraRig: {
      defaultRigRef: string;
      allowedRigRefs: readonly string[];
      target: { entityId: string; targetHeightMeters?: number };
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

export interface AnchorNodeSpecV1 {
  id: string;
  kind: "anchor";
  transform: TransformSpecV1;
  semantic: { classId: string };
}

export type WorldNodeSpecV1 =
  | TerrainNodeSpecV1
  | WaterNodeSpecV1
  | ObjectNodeSpecV1
  | SubjectNodeSpecV1
  | CameraNodeSpecV1
  | AnchorNodeSpecV1;

export interface RelationshipSpecV1 {
  id: string;
  type: string;
  schemaVersion: 1;
}

export interface RuleSpecV1 {
  id: string;
  kind: string;
}

export interface AuthoringSpecV1 {
  kind: "worldkit-authoring-spec";
  schemaVersion: 1;
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
      centerXZ: Vec2;
      sizeXZ: Vec2;
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
  resources: { prototypes: readonly PrimitivePrototypeSpecV1[] };
  nodes: readonly WorldNodeSpecV1[];
  relationships: readonly RelationshipSpecV1[];
  rules: readonly RuleSpecV1[];
  startup: {
    spawnAnchorId: string;
    controlledEntityId: string;
    cameraEntityId: string;
  };
  constraints: Record<string, never>;
}

export interface NormalizedTransformV1 {
  positionMeters: Vec3;
  rotationEulerRadiansXYZ: Vec3;
  scaleXYZ: Vec3;
}

export interface NormalizedProceduralTerrainSourceV1 {
  kind: "procedural";
  relief: ProceduralTerrainSourceSpecV1["relief"];
  baseHeightMeters: number;
  amplitudeMeters: number;
  frequencyPerMeter: number;
  octaves: number;
  lacunarityRatio: number;
  persistenceRatio: number;
}

export type NormalizedWorldNodeV1 =
  | (Omit<TerrainNodeSpecV1, "components"> & {
      components: {
        terrain: Omit<TerrainNodeSpecV1["components"]["terrain"], "source"> & {
          source: NormalizedProceduralTerrainSourceV1;
        };
      };
    })
  | (Omit<WaterNodeSpecV1, "components"> & {
      components: {
        water: Omit<
          WaterNodeSpecV1["components"]["water"],
          "shoreWidthMeters" | "traversalMode"
        > & {
          shoreWidthMeters: number;
          traversalMode: "blocked" | "swimmable" | "walkable";
        };
      };
    })
  | (Omit<ObjectNodeSpecV1, "transform"> & { transform: NormalizedTransformV1 })
  | (Omit<SubjectNodeSpecV1, "spawnAnchorEntityId"> & { spawnAnchorEntityId: string })
  | CameraNodeSpecV1
  | (Omit<AnchorNodeSpecV1, "transform"> & { transform: NormalizedTransformV1 });

/**
 * Engine-neutral, deterministic form of an AuthoringSpec. Optional authoring
 * conveniences have been expanded and all order-insensitive collections are
 * sorted. Engine adapters must never consume AuthoringSpec directly.
 */
export interface NormalizedWorldIRV1 {
  kind: "worldkit-normalized-world";
  schemaVersion: 1;
  id: string;
  seed: number;
  provenance?: AuthoringSpecV1["provenance"];
  world: AuthoringSpecV1["world"];
  resources: {
    prototypes: readonly PrimitivePrototypeSpecV1[];
    subjectDefinitions: readonly SubjectKitDefinitionV1[];
  };
  nodes: readonly NormalizedWorldNodeV1[];
  startup: AuthoringSpecV1["startup"];
}
