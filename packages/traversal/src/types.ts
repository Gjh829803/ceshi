export interface TraversalSurfaceIdentityV1 {
  readonly traversalSurfaceId: string;
  readonly surfaceEntityId: string;
  readonly colliderSubshapeId: string;
  readonly resourceRef: string;
  readonly resolvedVersion: string;
  readonly resourceHash: `sha256:${string}`;
}

export interface TraversalRuntimeImplementationIdentityV1 {
  readonly runtimeBackendRef: string;
  readonly runtimeBackendResolvedVersion: string;
  readonly runtimeBackendHash: `sha256:${string}`;
  readonly runtimeAdapterRef: string;
  readonly runtimeAdapterResolvedVersion: string;
  readonly runtimeAdapterHash: `sha256:${string}`;
}

export interface ResolvedTraversalLockV1 {
  readonly kind: "resolved-traversal-lock";
  readonly schemaVersion: 1;
  readonly subjectEntityId: string;
  readonly subjectDefinitionRef: string;
  readonly subjectDefinitionHash: `sha256:${string}`;
  readonly colliderProfileRef: string;
  readonly colliderProfileHash: `sha256:${string}`;
  readonly physicsBodyProfileRef: string;
  readonly physicsBodyProfileHash: `sha256:${string}`;
  readonly locomotionProfileRef: string;
  readonly locomotionProfileHash: `sha256:${string}`;
  readonly locomotionCapabilityRef: string;
  readonly locomotionCapabilityHash: `sha256:${string}`;
  readonly controlFeelProfileRef: string;
  readonly controlFeelProfileHash: `sha256:${string}`;
  readonly controlProfileRef: string;
  readonly controlProfileHash: `sha256:${string}`;
  readonly motionProfileRef: string;
  readonly motionProfileHash: `sha256:${string}`;
  readonly motionKernelRef: string;
  readonly motionKernelHash: `sha256:${string}`;
  readonly mediumProfileRef: string;
  readonly mediumProfileHash: `sha256:${string}`;
  readonly runtimeBackendRef: string;
  readonly runtimeBackendResolvedVersion: string;
  readonly runtimeBackendHash: `sha256:${string}`;
  readonly runtimeAdapterRef: string;
  readonly runtimeAdapterResolvedVersion: string;
  readonly runtimeAdapterHash: `sha256:${string}`;
  readonly capsuleRadiusMeters: number;
  readonly capsuleHeightMeters: number;
  readonly colliderCenterOffsetMetersXYZ: readonly [number, number, number];
  readonly maxSlopeDegrees: number;
  readonly maxStepHeightMeters: number;
}

export interface ResolvedTraversalLockReceiptV1 {
  readonly lock: ResolvedTraversalLockV1;
  readonly resolvedTraversalLockHash: `sha256:${string}`;
}

export interface TraversalDriverProfileV1 {
  readonly kind: "traversal-driver-profile";
  readonly schemaVersion: 1;
  readonly pathLookaheadMeters: number;
  readonly cornerSelectionMode: "next-visible-segment";
  readonly intentDirectionQuantizationRatio: number;
  readonly locomotionIntentMode: "walk";
}

export interface TraversalGraphBuilderProfileV1 {
  readonly kind: "traversal-graph-builder-profile";
  readonly schemaVersion: 1;
  readonly clearanceMarginMeters: number;
  readonly positionQuantizationMeters: number;
  readonly slopeCostWeight: number;
  readonly stepCostWeight: number;
  readonly maximumNodes: number;
  readonly maximumEdges: number;
  readonly maximumTiles: number;
  readonly maximumSearchSteps: number;
}

export interface TraversalGraphBuilderProfileV2 {
  readonly kind: "traversal-graph-builder-profile";
  readonly schemaVersion: 2;
  readonly clearanceMarginMeters: number;
  readonly voxelCellSizeMeters: number;
  readonly voxelCellHeightMeters: number;
  readonly tileSizeCells: number;
  readonly maximumEdgeLengthMeters: number;
  readonly maximumSimplificationErrorMeters: number;
  readonly positionQuantizationMeters: number;
  readonly slopeCostWeight: number;
  readonly stepCostWeight: number;
  readonly maximumNodes: number;
  readonly maximumEdges: number;
  readonly maximumTiles: number;
  readonly maximumSearchSteps: number;
}

export interface ResolvedTraversalDriverProfileV1 {
  readonly resourceRef: string;
  readonly resolvedVersion: "1";
  readonly contentHash: `sha256:${string}`;
  readonly profile: TraversalDriverProfileV1;
}

export interface ResolvedTraversalGraphBuilderProfileV1 {
  readonly resourceRef: string;
  readonly resolvedVersion: "1";
  readonly contentHash: `sha256:${string}`;
  readonly profile: TraversalGraphBuilderProfileV1;
}

export interface ResolvedTraversalGraphBuilderProfileV2 {
  readonly resourceRef: string;
  readonly resolvedVersion: "1";
  readonly contentHash: `sha256:${string}`;
  readonly profile: TraversalGraphBuilderProfileV2;
}

export type ResolvedTraversalGraphBuilderProfile =
  | ResolvedTraversalGraphBuilderProfileV1
  | ResolvedTraversalGraphBuilderProfileV2;

export interface TraversalCapabilityEnvelopeV1 {
  readonly kind: "traversal-capability-envelope";
  readonly schemaVersion: 1;
  readonly traversalMode: "ground";
  readonly subjectEntityId: string;
  readonly colliderProfileRef: string;
  readonly colliderProfileHash: `sha256:${string}`;
  readonly physicsBodyProfileRef: string;
  readonly physicsBodyProfileHash: `sha256:${string}`;
  readonly locomotionProfileRef: string;
  readonly locomotionProfileHash: `sha256:${string}`;
  readonly locomotionCapabilityRef: string;
  readonly locomotionCapabilityHash: `sha256:${string}`;
  readonly runtimeBackendRef: string;
  readonly runtimeBackendResolvedVersion: string;
  readonly runtimeBackendHash: `sha256:${string}`;
  readonly runtimeAdapterRef: string;
  readonly runtimeAdapterResolvedVersion: string;
  readonly runtimeAdapterHash: `sha256:${string}`;
  readonly capsuleRadiusMeters: number;
  readonly capsuleHeightMeters: number;
  readonly colliderCenterOffsetMetersXYZ: readonly [number, number, number];
  readonly maxSlopeDegrees: number;
  readonly maxStepHeightMeters: number;
  readonly resolvedTraversalLockHash: `sha256:${string}`;
  readonly graphBuilderProfileRef: string;
  readonly graphBuilderResolvedVersion: string;
  readonly graphBuilderProfileHash: `sha256:${string}`;
  readonly clearanceMarginMeters: number;
  readonly voxelCellSizeMeters: number;
  readonly voxelCellHeightMeters: number;
  readonly tileSizeCells: number;
  readonly maximumEdgeLengthMeters: number;
  readonly maximumSimplificationErrorMeters: number;
  readonly positionQuantizationMeters: number;
  readonly slopeCostWeight: number;
  readonly stepCostWeight: number;
  readonly maximumNodes: number;
  readonly maximumEdges: number;
  readonly maximumTiles: number;
  readonly maximumSearchSteps: number;
}

export interface TraversalCapabilityEnvelopeReceiptV1 {
  readonly envelope: TraversalCapabilityEnvelopeV1;
  readonly traversalCapabilityEnvelopeHash: `sha256:${string}`;
}
