import type {
  Diagnostic,
  EntityId,
  FeatureId,
  ResourceId,
  Vec3Tuple,
} from "@whitebox-world/contracts";

export type { Diagnostic, EntityId, FeatureId, ResourceId, Vec3Tuple };

export interface Aabb {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

export interface TransformSnapshot {
  entityId: EntityId;
  position: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
  featureId?: FeatureId;
}

export interface SpawnCollider {
  bounds: Aabb;
  entityId?: EntityId;
  featureId?: FeatureId;
  isTrigger?: boolean;
}

export type SpawnFootprintBoundary =
  | {
      kind: "circle";
      centerMetersXZ: readonly [x: number, z: number];
      radiusMeters: number;
    }
  | {
      kind: "ellipse";
      centerMetersXZ: readonly [x: number, z: number];
      radiusMetersXZ: readonly [x: number, z: number];
    }
  | {
      kind: "polygon";
      pointsMetersXZ: readonly (readonly [x: number, z: number])[];
    };

export interface SpawnWaterSurface {
  entityId: EntityId;
  featureId?: FeatureId;
  boundary: SpawnFootprintBoundary;
  waterLevelMeters: number;
  depthMeters: number;
  traversalMode: "blocked" | "walkable" | "swimmable";
}

export interface SpawnStaticBlockingObject {
  entityId: EntityId;
  featureId?: FeatureId;
  footprint: SpawnFootprintBoundary;
  heightRangeMeters?: readonly [minimum: number, maximum: number];
}

export interface SpawnSafetyInput {
  entityId: EntityId;
  /** Player feet position in world space. */
  position: Vec3Tuple;
  capsule?: {
    radius: number;
    height: number;
  };
  worldBounds?: Aabb;
  colliders?: readonly SpawnCollider[];
  waterSurfaces?: readonly SpawnWaterSurface[];
  staticBlockingObjects?: readonly SpawnStaticBlockingObject[];
  ground?: {
    heightAt(x: number, z: number): number | undefined;
    slopeDegreesAt?(x: number, z: number): number | undefined;
    maxWalkableSlopeDegrees?: number;
    tolerance?: number;
    maxDrop?: number;
  };
}

export interface FeatureSnapshot {
  id: FeatureId;
  type: string;
  version: number;
  resources: readonly ResourceId[];
  dependencies?: readonly FeatureId[];
}

export interface ResourceSnapshot {
  id: ResourceId;
  kind: string;
  ownerFeatureId?: FeatureId;
}

export interface FeatureOwnershipInput {
  features: readonly FeatureSnapshot[];
  resources?: readonly ResourceSnapshot[];
  requireEveryResourceOwned?: boolean;
}

export interface DiagnosticSummary {
  diagnostics: readonly Diagnostic[];
  total: number;
  bySeverity: Readonly<Record<Diagnostic["severity"], number>>;
  byCode: Readonly<Record<string, number>>;
  maxSeverity: Diagnostic["severity"] | null;
  hasErrors: boolean;
}
