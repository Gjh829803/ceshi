import type {
  BabylonNativeTraversalBindingV1,
} from "@whitebox-world/native-babylon";

export type BabylonNativeBlockColliderGeometrySourceV1 =
  | Readonly<{ kind: "block"; blockId: string }>
  | Readonly<{ kind: "block-group"; colliderGroupId: string }>;

export type BabylonNativeBlockExposedEdgePolicyV1 =
  | "none"
  | "protect-ground-subject";

export interface BabylonNativeBlockStaticColliderSelectionV1 {
  readonly id: string;
  readonly colliderGeometrySource: BabylonNativeBlockColliderGeometrySourceV1;
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly exposedEdgePolicy: BabylonNativeBlockExposedEdgePolicyV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}

export interface BabylonNativeBlockColliderCandidateInventoryEntryV1 {
  readonly colliderId: string;
  readonly sourceBlockIds: readonly [string, ...string[]];
  readonly visualGroupIds: readonly string[];
  readonly proxyKind:
    | "continuous-walkable-surface"
    | "exact-solid-union";
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly exposedEdgePolicy: BabylonNativeBlockExposedEdgePolicyV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
  readonly minimumMetersXYZ: readonly [number, number, number];
  readonly maximumMetersXYZ: readonly [number, number, number];
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly topologyHash: `sha256:${string}`;
}
