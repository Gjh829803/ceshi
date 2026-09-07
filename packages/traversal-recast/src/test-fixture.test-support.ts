import {
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
} from "@whitebox-world/runtime-babylon";
import {
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  createRouteBuildInputReceiptV2,
  createTraversalCapabilityEnvelopeV1,
  deriveColliderSubshapeIdV1,
  hashRouteColliderArtifactV2,
  hashRouteGeometryArtifactV2,
  hashRouteSurfaceArtifactV2,
  hashRouteTerrainArtifactV2,
  resolveTraversalGraphBuilderProfileV2,
  resolveTraversalLockV1,
  type CanonicalTriangleSoupV1,
  type ResolvedTraversalLockV1,
  type ResolvedTraversalLockReceiptV1,
  type RouteBuildInputReceiptV2,
  type RouteBuildInputV2,
  type StaticColliderSourceV1,
  type TraversalCapabilityEnvelopeV1,
  type TraversalSurfaceIdentityV1,
} from "@whitebox-world/traversal";
import { emitTransformedStaticColliderTriangleMeshV1 } from "@whitebox-world/terrain-surface";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const HASH_C =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
const HASH_D =
  "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;
const HASH_E =
  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;

export function createRecastTestLockReceiptV1(
  overrides: Partial<ResolvedTraversalLockV1> = {},
): ResolvedTraversalLockReceiptV1 {
  const runtimeIdentity = BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1;
  return resolveTraversalLockV1({
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: "player",
    resourceLockHash: HASH_A,
    subjectDefinitionRef: "worldkit://subject-definition/humanoid.third-person@1",
    subjectDefinitionHash: HASH_A,
    colliderSource: { kind: "profile", colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1", colliderProfileHash: HASH_A },
    physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
    physicsBodyProfileHash: HASH_A,
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    locomotionProfileHash: HASH_A,
    locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
    locomotionCapabilityHash: HASH_A,
    controlFeelProfileRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
    controlFeelProfileHash: HASH_A,
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    controlProfileHash: HASH_A,
    motionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
    motionProfileHash: HASH_A,
    motionKernelRef: "worldkit://motion-kernel/free-ground@1",
    motionKernelHash: HASH_A,
    mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
    mediumProfileHash: HASH_A,
    ...runtimeIdentity,
    capsuleRadiusMeters: 0.32,
    capsuleHeightMeters: 1.92,
    colliderCenterOffsetMetersXYZ: [0, 0.96, 0],
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
    ...overrides,
  });
}

export function createRecastTestEnvelopeV1(
  overrides: Partial<ResolvedTraversalLockV1> = {},
): TraversalCapabilityEnvelopeV1 {
  const lock = createRecastTestLockReceiptV1(overrides);
  return createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt: lock,
    graphBuilderProfile: resolveTraversalGraphBuilderProfileV2(
      BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    ),
  }).envelope;
}

function planeSoup(
  minimumX: number,
  maximumX: number,
  minimumZ: number,
  maximumZ: number,
  heightMeters = 0,
): CanonicalTriangleSoupV1 {
  return {
    positionsMetersXYZ: [
      minimumX, heightMeters, minimumZ,
      minimumX, heightMeters, maximumZ,
      maximumX, heightMeters, minimumZ,
      maximumX, heightMeters, maximumZ,
    ],
    triangleIndices: [0, 1, 2, 2, 1, 3],
  };
}

function mergeSoups(
  soups: readonly CanonicalTriangleSoupV1[],
): CanonicalTriangleSoupV1 {
  const positionsMetersXYZ: number[] = [];
  const triangleIndices: number[] = [];
  for (const soup of soups) {
    const vertexOffset = positionsMetersXYZ.length / 3;
    positionsMetersXYZ.push(...soup.positionsMetersXYZ);
    for (const triangleIndex of soup.triangleIndices) {
      triangleIndices.push(vertexOffset + triangleIndex);
    }
  }
  return { positionsMetersXYZ, triangleIndices };
}

function worldSoup(
  mesh: {
    readonly worldPositionsMetersXYZ: readonly number[];
    readonly triangleIndices: readonly number[];
  },
): CanonicalTriangleSoupV1 {
  return {
    positionsMetersXYZ: mesh.worldPositionsMetersXYZ,
    triangleIndices: mesh.triangleIndices,
  };
}

function boxSoup(input: Readonly<{
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
  bottomMeters: number;
  topMeters: number;
}>): CanonicalTriangleSoupV1 {
  const sizeX = input.maximumX - input.minimumX;
  const sizeY = input.topMeters - input.bottomMeters;
  const sizeZ = input.maximumZ - input.minimumZ;
  return worldSoup(emitTransformedStaticColliderTriangleMeshV1(
    { kind: "box", sizeMetersXYZ: [sizeX, sizeY, sizeZ] },
    {
      positionMetersXYZ: [
        (input.minimumX + input.maximumX) / 2,
        (input.bottomMeters + input.topMeters) / 2,
        (input.minimumZ + input.maximumZ) / 2,
      ],
      rotationEulerRadiansXYZ: [0, 0, 0],
      scaleXYZ: [1, 1, 1],
    },
  ));
}

function rampSoup(input: Readonly<{
  startX: number;
  endX: number;
  minimumZ: number;
  maximumZ: number;
  startHeightMeters: number;
  endHeightMeters: number;
}>): CanonicalTriangleSoupV1 {
  const x0 = input.startX;
  const x1 = input.endX;
  const z0 = input.minimumZ;
  const z1 = input.maximumZ;
  const yTop0 = input.startHeightMeters;
  const yTop1 = input.endHeightMeters;
  // Closed 6-vertex wedge: downhill edge sits at (endX, endHeight) without a
  // vertical end-cap, so endHeight 0 does not collapse into zero-area triangles.
  const positionsMetersXYZ = [
    x0, yTop0, z0,
    x0, yTop0, z1,
    x1, yTop1, z0,
    x1, yTop1, z1,
    x0, 0, z0,
    x0, 0, z1,
  ];
  const triangleIndices = [
    0, 1, 3,
    0, 3, 2,
    4, 2, 3,
    4, 3, 5,
    0, 4, 5,
    0, 5, 1,
    0, 2, 4,
    1, 5, 3,
  ];
  return { positionsMetersXYZ, triangleIndices };
}

function xzExtrema(
  soups: readonly CanonicalTriangleSoupV1[],
): readonly [readonly [number, number], readonly [number, number]] {
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (const soup of soups) {
    for (let offset = 0; offset < soup.positionsMetersXYZ.length; offset += 3) {
      const x = soup.positionsMetersXYZ[offset]!;
      const z = soup.positionsMetersXYZ[offset + 2]!;
      minimumX = Math.min(minimumX, x);
      maximumX = Math.max(maximumX, x);
      minimumZ = Math.min(minimumZ, z);
      maximumZ = Math.max(maximumZ, z);
    }
  }
  return [[minimumX, minimumZ], [maximumX, maximumZ]];
}

function collider(
  entityId: string,
  soup: CanonicalTriangleSoupV1,
  hash: `sha256:${string}`,
): StaticColliderSourceV1 {
  const logicalSubshapeId = "primary";
  return {
    entityId,
    logicalSubshapeId,
    colliderSubshapeId: deriveColliderSubshapeIdV1(entityId, logicalSubshapeId),
    colliderHash: hash,
    triangleSoup: soup,
  };
}

function surface(
  traversalSurfaceId: string,
  surfaceEntityId: string,
  colliderSubshapeId: string,
  resourceHash: `sha256:${string}`,
): TraversalSurfaceIdentityV1 {
  return {
    traversalSurfaceId,
    surfaceEntityId,
    colliderSubshapeId,
    resourceRef: `worldkit://traversal-surface/${traversalSurfaceId}@1`,
    resolvedVersion: "1",
    resourceHash,
  };
}

export interface MultiSurfaceRouteFixtureOptionsV2 {
  readonly stepHeightMeters?: number;
  readonly gapMeters?: number;
  readonly overlapCoplanarMeters?: number;
  readonly includeUnboundWall?: boolean;
  readonly bindStaticSurfaces?: boolean;
  readonly extraDummySurfaceCount?: number;
  readonly destinationOnPlatform?: boolean;
  readonly walkwayMinimumZ?: number;
  readonly walkwayMaximumZ?: number;
  readonly includeLowOverhead?: boolean;
  readonly emptyTerrain?: boolean;
  readonly ambiguousStartLayerHeightMeters?: number;
  readonly stepPlatformGapMeters?: number;
  readonly includeRemoteExactStepPlatformSeam?: boolean;
  readonly hardRibbonWidthMeters?: number;
  readonly rampEndHeightMeters?: number;
}

export function createMultiSurfaceRouteBuildInputReceiptV2(
  options: MultiSurfaceRouteFixtureOptionsV2 = {},
): RouteBuildInputReceiptV2 {
  const stepHeightMeters = options.stepHeightMeters ?? 0.25;
  const gapMeters = options.gapMeters ?? 0;
  const overlapCoplanarMeters = options.overlapCoplanarMeters ?? 0;
  const walkwayMinimumZ = options.walkwayMinimumZ ?? 1;
  const walkwayMaximumZ = options.walkwayMaximumZ ?? 5;
  const stepPlatformGapMeters = options.stepPlatformGapMeters ?? 0;
  const rampEndHeightMeters = options.rampEndHeightMeters ?? 0;
  const capabilityEnvelope = createRecastTestEnvelopeV1();
  const terrainSoup = mergeSoups([
    planeSoup(0, 4, 0, 6),
    planeSoup(16 + gapMeters, 20 + gapMeters, 0, 6, rampEndHeightMeters),
  ]);
  const [minimumMetersXZ, maximumMetersXZ] = xzExtrema([terrainSoup]);
  const stepSoup = boxSoup({
    minimumX: 4,
    maximumX: 7,
    minimumZ: walkwayMinimumZ,
    maximumZ: walkwayMaximumZ,
    bottomMeters: 0,
    topMeters: stepHeightMeters,
  });
  const platformSoup = boxSoup({
    minimumX: 7 + stepPlatformGapMeters - overlapCoplanarMeters,
    maximumX: 12,
    minimumZ: walkwayMinimumZ,
    maximumZ: walkwayMaximumZ,
    bottomMeters: 0,
    topMeters: stepHeightMeters,
  });
  const step = collider(
    "step-box",
    options.includeRemoteExactStepPlatformSeam === true
      ? mergeSoups([stepSoup, boxSoup({
          minimumX: 0,
          maximumX: 1,
          minimumZ: 6,
          maximumZ: 7,
          bottomMeters: 0,
          topMeters: stepHeightMeters,
        })])
      : stepSoup,
    HASH_B,
  );
  const platform = collider(
    "platform-deck",
    options.includeRemoteExactStepPlatformSeam === true
      ? mergeSoups([platformSoup, boxSoup({
          minimumX: 1,
          maximumX: 2,
          minimumZ: 6,
          maximumZ: 7,
          bottomMeters: 0,
          topMeters: stepHeightMeters,
        })])
      : platformSoup,
    HASH_C,
  );
  const ramp = collider(
    "ramp-slab",
    rampSoup({
      startX: 12,
      endX: 16,
      minimumZ: walkwayMinimumZ,
      maximumZ: walkwayMaximumZ,
      startHeightMeters: stepHeightMeters,
      endHeightMeters: rampEndHeightMeters,
    }),
    HASH_D,
  );
  const wall = collider(
    "unbound-wall",
    boxSoup({
      minimumX: 21,
      maximumX: 22,
      minimumZ: 0,
      maximumZ: 6,
      bottomMeters: 0,
      topMeters: 2,
    }),
    HASH_E,
  );
  const extraDummySurfaceCount = options.extraDummySurfaceCount ?? 0;
  const dummyColliders = Array.from({ length: extraDummySurfaceCount }, (_, index) => {
    const originX = 24 + index * 0.6;
    return collider(
      `dummy-box-${index}`,
      boxSoup({
        minimumX: originX,
        maximumX: originX + 0.4,
        minimumZ: 8,
        maximumZ: 8.4,
        bottomMeters: 0,
        topMeters: 0.2,
      }),
      HASH_A,
    );
  });
  const overhead = collider(
    "overhead-slab",
    boxSoup({
      minimumX: 0,
      maximumX: 20 + gapMeters,
      minimumZ: 0,
      maximumZ: 6,
      bottomMeters: 1.0,
      topMeters: 1.2,
    }),
    HASH_E,
  );
  const startUpperDeck = options.ambiguousStartLayerHeightMeters === undefined
    ? undefined
    : collider(
        "start-upper-deck",
        boxSoup({
          minimumX: 0,
          maximumX: 4,
          minimumZ: 0,
          maximumZ: 6,
          bottomMeters: options.ambiguousStartLayerHeightMeters - 0.2,
          topMeters: options.ambiguousStartLayerHeightMeters,
        }),
        HASH_E,
      );
  const extraUnbound = [
    ...(options.includeUnboundWall === true ? [wall] : []),
    ...(options.includeLowOverhead === true ? [overhead] : []),
  ];
  const staticColliders = (
    extraUnbound.length > 0
      ? [platform, ramp, step, ...extraUnbound, ...dummyColliders]
      : [platform, ramp, step, ...dummyColliders]
  ).concat(startUpperDeck === undefined ? [] : [startUpperDeck]).sort((left, right) =>
    left.colliderSubshapeId < right.colliderSubshapeId
      ? -1
      : left.colliderSubshapeId > right.colliderSubshapeId
        ? 1
        : 0,
  );
  const boundStaticSurfaces = options.bindStaticSurfaces === false
    ? []
    : [
        surface(
          "surface-platform",
          platform.entityId,
          platform.colliderSubshapeId,
          HASH_B,
        ),
        surface("surface-ramp", ramp.entityId, ramp.colliderSubshapeId, HASH_C),
        surface("surface-step", step.entityId, step.colliderSubshapeId, HASH_D),
        ...(startUpperDeck === undefined
          ? []
          : [surface(
              "surface-start-upper-deck",
              startUpperDeck.entityId,
              startUpperDeck.colliderSubshapeId,
              HASH_E,
            )]),
      ];
  const dummySurfaces = dummyColliders.map((row, index) => surface(
    `surface-dummy-${String(index).padStart(2, "0")}`,
    row.entityId,
    row.colliderSubshapeId,
    HASH_A,
  ));
  const traversalSurfaces = [
    surface("surface-heightfield", "terrain-main", "heightfield", HASH_A),
    ...boundStaticSurfaces,
    ...dummySurfaces,
  ].sort((left, right) =>
    left.traversalSurfaceId < right.traversalSurfaceId
      ? -1
      : left.traversalSurfaceId > right.traversalSurfaceId
        ? 1
        : 0,
  );
  const destinationX = 18 + gapMeters;
  const emptyTerrain = options.emptyTerrain === true;
  const startPositionMetersXYZ = options.ambiguousStartLayerHeightMeters !== undefined
    ? [2, options.ambiguousStartLayerHeightMeters / 2, 3] as const
    : emptyTerrain
    ? [8, stepHeightMeters, 3] as const
    : [2, 0, 3] as const;
  const destinationPositionMetersXYZ = emptyTerrain
    ? [11, stepHeightMeters, 3] as const
    : options.destinationOnPlatform === true
      ? [9.5, stepHeightMeters, 3] as const
      : [destinationX, rampEndHeightMeters, 3] as const;
  const ribbonEndX = emptyTerrain
    ? 12
    : options.destinationOnPlatform === true
      ? 12
      : destinationX;
  const draft = {
    kind: "route-build-input" as const,
    schemaVersion: 2 as const,
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_A,
    resourceLockHash: HASH_A,
    connectivityRequirement: {
      constraintId: "constraint-route",
      traversingEntityId: "player",
      startAnchorEntityId: "anchor-start",
      destinationAnchorEntityId: "anchor-destination",
      routeId: "route-main",
    },
    startAnchor: {
      entityId: "anchor-start",
      positionMetersXYZ: startPositionMetersXYZ,
    },
    destinationAnchor: {
      entityId: "anchor-destination",
      positionMetersXYZ: destinationPositionMetersXYZ,
    },
    hardRibbon: {
      routeId: "route-main",
      pointsMetersXZ: [[0, 3], [ribbonEndX, 3]] as const,
      widthMeters: options.hardRibbonWidthMeters ?? 8,
      locomotionProfileRef: capabilityEnvelope.locomotionProfileRef,
    },
    traversalSurfaces,
    capabilityEnvelope,
    terrainSource: emptyTerrain
      ? {
          kind: "empty" as const,
          terrainEntityId: "terrain-main",
        }
      : {
          kind: "bounded" as const,
          terrainEntityId: "terrain-main",
          triangleSoup: terrainSoup,
          minimumMetersXZ,
          maximumMetersXZ,
        },
    staticColliders,
    blockedTraversalAreaExclusions: [] as const,
    blockedWaterExclusions: [] as const,
  };
  const terrainArtifactHash = hashRouteTerrainArtifactV2(draft.terrainSource);
  const colliderArtifactHash = hashRouteColliderArtifactV2(draft.staticColliders);
  const input: RouteBuildInputV2 = {
    ...draft,
    terrainArtifactHash,
    colliderArtifactHash,
    geometryArtifactHash: hashRouteGeometryArtifactV2({
      terrainArtifactHash,
      colliderArtifactHash,
    }),
    surfaceArtifactHash: hashRouteSurfaceArtifactV2(draft.traversalSurfaces),
  };
  return createRouteBuildInputReceiptV2({
    input,
    traversalLockReceipt: createRecastTestLockReceiptV1({
      resourceLockHash: capabilityEnvelope.resourceLockHash,
    }),
  });
}

export function createOverlappingSurfaceRouteBuildInputReceiptV2(): RouteBuildInputReceiptV2 {
  return createMultiSurfaceRouteBuildInputReceiptV2({
    overlapCoplanarMeters: 1,
  });
}
