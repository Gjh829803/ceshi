import type {
  Diagnostic,
  EntityId,
  FeatureId,
  ResourceId,
  Vec3Tuple,
} from "@whitebox-world/contracts";

export type { Diagnostic, EntityId, FeatureId, ResourceId, Vec3Tuple };

export interface TransformSnapshot {
  entityId: EntityId;
  position: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
  featureId?: FeatureId;
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
