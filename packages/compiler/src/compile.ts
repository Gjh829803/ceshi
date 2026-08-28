import type {
  NormalizedAnimationSetV1,
  NormalizedColliderProfileV1,
  NormalizedRigProfileV1,
  NormalizedSubjectAssetV1,
  NormalizedSubjectDefinitionV2,
  NormalizedWorldIRV4,
  NormalizedLayoutAssertionV1,
  NormalizedWorldNodeV4,
  NormalizedSubjectSocketV2,
  NormalizedSubjectVisualPartV2,
  PrimitivePrototypeSpecV2,
  PrototypeTraversalSurfaceBindingV1,
  Vec2,
} from "@whitebox-world/authoring";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { BIPED_BONE_IDS_V1 } from "@whitebox-world/subject-contracts";
import {
  sampleTriangleHeightfieldSurface,
  validateSpawnSafety,
  type SpawnFootprintBoundary,
  type SpawnStaticBlockingObject,
} from "@whitebox-world/terrain-surface";
import {
  canonicalExecutionResourceLockEntriesV1,
  hashExecutionPlanV5,
  parseExecutionPlanV5,
  type CompileDiagnostic,
  type ExecutionAnimationSetV1,
  type ExecutionColliderProfileV1,
  type ExecutionObjectPrimitiveV3,
  type ExecutionObjectV3,
  type ExecutionPlanV5,
  type GameplayBootstrapExecutionResourceLockV1,
  type ExecutionLayoutAssertionV1,
  type ExecutionLayoutPlacementV1,
  type ExecutionRigProfileV1,
  type ExecutionSubjectAssetV1,
  type ExecutionSubjectV3,
  type ExecutionTerrainV3,
  type ExecutionWaterBoundaryV3,
  type ExecutionWaterV3,
  type SubjectSocketV3,
  type SubjectVisualPartV3,
} from "@whitebox-world/runtime-contracts";
import type {
  CompileWorldResultV5,
  ExecutionConnectivityRequirementV1,
  ExecutionHeightfieldTraversalSurfaceV1,
  ExecutionTraversalAreaV1,
  ExecutionStaticColliderShapeV1,
  ExecutionStaticColliderV1,
  ExecutionStaticColliderTraversalSurfaceV1,
} from "@whitebox-world/runtime-contracts";
import {
  deriveColliderSubshapeIdV1,
  resolveTraversalSurfaceProfileV1,
} from "@whitebox-world/traversal";
import { isNil, max, min } from "lodash-es";

import { sampleFractalNoise } from "./noise";

export function assertPublishedMovementMediumSupported(
  movementMedium: string,
): void {
  if (movementMedium === "water") {
    throw new Error("SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED:");
  }
}

function rejectPublishedWaterMediumProfile(mediumProfile: object): void {
  // The V1 Medium Profile type has no water fields; this guards forged or
  // stale Normalized IR that still smuggles them in at runtime.
  const forged = mediumProfile as {
    water?: unknown;
    supportedMediums?: readonly string[];
  };
  if (
    forged.water !== undefined ||
    forged.supportedMediums?.includes("water")
  ) {
    assertPublishedMovementMediumSupported("water");
  }
}

type NormalizedWorldCompileView = Pick<
  NormalizedWorldIRV4,
  "id" | "seed" | "world" | "resources" | "nodes" | "startup"
>;

interface CompileWorldCoreInput {
  normalizedWorldIr: NormalizedWorldCompileView;
}

interface CompiledWorldComponents {
  readonly id: ExecutionPlanV5["id"];
  readonly seed: ExecutionPlanV5["seed"];
  readonly runtimeBackend: ExecutionPlanV5["runtimeBackend"];
  readonly coordinateSystem: ExecutionPlanV5["coordinateSystem"];
  readonly gravityMetersPerSecondSquaredXYZ:
    ExecutionPlanV5["gravityMetersPerSecondSquaredXYZ"];
  readonly atmospherePreset: ExecutionPlanV5["atmospherePreset"];
  readonly terrain: ExecutionPlanV5["terrain"];
  readonly waters: ExecutionPlanV5["waters"];
  readonly objects: ExecutionPlanV5["objects"];
  readonly subjectAssets: ExecutionPlanV5["subjectAssets"];
  readonly rigProfiles: ExecutionPlanV5["rigProfiles"];
  readonly animationSets: ExecutionPlanV5["animationSets"];
  readonly colliderProfiles: ExecutionPlanV5["colliderProfiles"];
  readonly controlledEntityId: string;
  readonly subjects: ExecutionPlanV5["subjects"];
  readonly camera: ExecutionPlanV5["camera"];
  readonly resourceUsage: ExecutionPlanV5["resourceUsage"];
}

interface CompileWorldCoreResult {
  readonly ok: boolean;
  readonly components?: CompiledWorldComponents;
  readonly diagnostics: readonly CompileDiagnostic[];
}

export interface CompileWorldInputV5 {
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly normalizedWorldIrHash: string;
  readonly gameplayBootstrapResourceLock: GameplayBootstrapExecutionResourceLockV1;
}

class CompilerInputAccessorErrorV1 extends Error {}

function assertCompilerInputAccessorFreeV1(
  value: unknown,
  visited: WeakSet<object> = new WeakSet<object>(),
): void {
  if (isNil(value) || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new CompilerInputAccessorErrorV1();
  }
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) {
      throw new CompilerInputAccessorErrorV1();
    }
    if (Object.hasOwn(descriptor, "value")) {
      assertCompilerInputAccessorFreeV1(descriptor.value, visited);
    }
  }
}

function snapshotCompileWorldInputV5(
  input: CompileWorldInputV5,
): CompileWorldInputV5 {
  assertCompilerInputAccessorFreeV1(input);
  return structuredClone(input);
}

export function sampleTerrainHeight(
  terrain: ExecutionTerrainV3,
  pointMetersXZ: Vec2,
): number {
  const [columns, rows] = terrain.resolutionCellsXZ;
  const minimumX = terrain.centerMetersXZ[0] - terrain.sizeMetersXZ[0] / 2;
  const minimumZ = terrain.centerMetersXZ[1] - terrain.sizeMetersXZ[1] / 2;
  const maximumX = minimumX + terrain.sizeMetersXZ[0];
  const maximumZ = minimumZ + terrain.sizeMetersXZ[1];
  return sampleTriangleHeightfieldSurface(
    {
      centerMetersXZ: terrain.centerMetersXZ,
      sizeMetersXZ: terrain.sizeMetersXZ,
      resolutionVerticesXZ: terrain.resolutionCellsXZ,
      heightSamplesMeters: terrain.heightSamplesMeters,
    },
    [
      Math.max(minimumX, Math.min(maximumX, pointMetersXZ[0])),
      Math.max(minimumZ, Math.min(maximumZ, pointMetersXZ[1])),
    ],
  )!.heightMeters;
}

function findOnlyNodeV4<K extends NormalizedWorldNodeV4["kind"]>(
  nodes: readonly NormalizedWorldNodeV4[],
  kind: K,
): Extract<NormalizedWorldNodeV4, { kind: K }> {
  const node = nodes.find(
    (candidate): candidate is Extract<NormalizedWorldNodeV4, { kind: K }> =>
      candidate.kind === kind,
  );
  if (node === undefined) {
    throw new Error(`NormalizedWorldIR invariant violated: missing '${kind}' node.`);
  }
  return node;
}

function compileTerrainV3(world: NormalizedWorldCompileView): ExecutionTerrainV3 {
  const node = findOnlyNodeV4(world.nodes, "terrain");
  const terrain = node.components.terrain;
  const source = terrain.source;
  const [columns, rows] = terrain.grid.resolutionCellsXZ;
  const [centerX, centerZ] = terrain.grid.centerMetersXZ;
  const [sizeX, sizeZ] = terrain.grid.sizeMetersXZ;
  const minimumX = centerX - sizeX / 2;
  const minimumZ = centerZ - sizeZ / 2;
  const sampledHeights = terrain.grid.heightSamplesMeters;
  const heights: number[] = [];
  if (!isNil(sampledHeights)) {
    if (sampledHeights.length !== columns * rows) {
      throw new Error(
        "NormalizedWorldIR invariant violated: terrain grid heightSamplesMeters length must equal resolutionCellsXZ product.",
      );
    }
    for (const height of sampledHeights) {
      heights.push(height);
    }
  } else {
    for (let zIndex = 0; zIndex < rows; zIndex += 1) {
      const z = minimumZ + (zIndex / (rows - 1)) * sizeZ;
      for (let xIndex = 0; xIndex < columns; xIndex += 1) {
        const x = minimumX + (xIndex / (columns - 1)) * sizeX;
        const noise =
          source.amplitudeMeters === 0
            ? 0
            : sampleFractalNoise(
                world.seed,
                x * source.frequencyPerMeter,
                z * source.frequencyPerMeter,
                source.octaves,
                source.lacunarityRatio,
                source.persistenceRatio,
              );
        heights.push(source.baseHeightMeters + noise * source.amplitudeMeters);
      }
    }
  }
  let minimumHeightMeters = Number.POSITIVE_INFINITY;
  let maximumHeightMeters = Number.NEGATIVE_INFINITY;
  for (const height of heights) {
    minimumHeightMeters = Math.min(minimumHeightMeters, height);
    maximumHeightMeters = Math.max(maximumHeightMeters, height);
  }

  return {
    entityId: node.id,
    centerMetersXZ: [...terrain.grid.centerMetersXZ],
    sizeMetersXZ: [...terrain.grid.sizeMetersXZ],
    resolutionCellsXZ: [...terrain.grid.resolutionCellsXZ],
    heightSamplesMeters: heights,
    heightSamplesHash: sha256CanonicalJson(heights),
    minimumHeightMeters,
    maximumHeightMeters,
    semanticClassId: terrain.semantic?.classId ?? "terrain.ground",
  };
}

function boundaryCenterV3(boundary: ExecutionWaterBoundaryV3): Vec2 {
  if (boundary.kind !== "polygon") return boundary.centerMetersXZ;
  const total = boundary.pointsMetersXZ.reduce<Vec2>(
    (sum, point) => [sum[0] + point[0], sum[1] + point[1]],
    [0, 0],
  );
  return [
    total[0] / boundary.pointsMetersXZ.length,
    total[1] / boundary.pointsMetersXZ.length,
  ];
}

function compileWatersV3(
  world: NormalizedWorldCompileView,
  terrain: ExecutionTerrainV3,
): ExecutionWaterV3[] {
  return world.nodes
    .filter(
      (node): node is Extract<NormalizedWorldNodeV4, { kind: "water" }> =>
        node.kind === "water",
    )
    .map((node) => {
      const water = node.components.water;
      const boundary = structuredClone(water.boundary) as ExecutionWaterBoundaryV3;
      return {
        entityId: node.id,
        terrainEntityId: water.terrainEntityId,
        boundary,
        depthMeters: water.depthMeters,
        shoreWidthMeters: water.shoreWidthMeters,
        waterLevelMeters:
          water.waterLevelMeters ??
          sampleTerrainHeight(terrain, boundaryCenterV3(boundary)),
        traversalMode: water.traversalMode,
        semanticClassId: water.semantic?.classId ?? "water.surface",
      };
    })
    .sort((left, right) => left.entityId.localeCompare(right.entityId));
}

function resolvePrimitiveV3(
  prototype: PrimitivePrototypeSpecV2,
): ExecutionObjectPrimitiveV3 {
  switch (prototype.primitive) {
    case "box":
      return { kind: "box", sizeMetersXYZ: [...prototype.sizeMetersXYZ] };
    case "sphere":
      return { kind: "sphere", radiusMeters: prototype.radiusMeters };
    case "cylinder":
    case "cone":
      return {
        kind: prototype.primitive,
        radiusMeters: prototype.radiusMeters,
        heightMeters: prototype.heightMeters,
      };
  }
}

function compileObjectsV3(world: NormalizedWorldCompileView): ExecutionObjectV3[] {
  const prototypes = new Map(
    world.resources.prototypes.map((prototype) => [
      `${prototype.id}@${prototype.version}`,
      prototype,
    ]),
  );
  return world.nodes
    .filter(
      (node): node is Extract<NormalizedWorldNodeV4, { kind: "object" }> =>
        node.kind === "object",
    )
    .map((node) => {
      const prototypeIdentity = node.prototypeRef.slice(
        "package://prototype/".length,
      );
      const prototype = prototypes.get(prototypeIdentity);
      if (prototype === undefined) {
        throw new Error(
          `NormalizedWorldIR invariant violated: missing Prototype '${prototypeIdentity}'.`,
        );
      }
      return {
        entityId: node.id,
        prototypeId: prototype.id,
        primitive: resolvePrimitiveV3(prototype),
        transform: structuredClone(node.transform),
        collisionEnabled: prototype.collisionEnabled,
        semanticClassId:
          prototype.semantic?.classId ?? `object.${prototype.primitive}`,
      };
    })
    .sort((left, right) => left.entityId.localeCompare(right.entityId));
}

function staticObjectFootprintV3(
  object: ExecutionObjectV3,
): SpawnStaticBlockingObject | undefined {
  const [rotationX, rotationY, rotationZ] = object.transform.rotationEulerRadiansXYZ;
  if (Math.abs(rotationX) > 1e-8 || Math.abs(rotationZ) > 1e-8) return undefined;
  const [scaleX, scaleY, scaleZ] = object.transform.scaleXYZ.map(Math.abs) as [
    number,
    number,
    number,
  ];
  const [centerX, centerY, centerZ] = object.transform.positionMetersXYZ;
  let footprint: SpawnFootprintBoundary;
  let halfHeightMeters: number;
  if (object.primitive.kind === "box") {
    const halfX = object.primitive.sizeMetersXYZ[0] * scaleX / 2;
    const halfZ = object.primitive.sizeMetersXYZ[2] * scaleZ / 2;
    const cosine = Math.cos(rotationY);
    const sine = Math.sin(rotationY);
    footprint = {
      kind: "polygon",
      pointsMetersXZ: [
        [-halfX, -halfZ],
        [halfX, -halfZ],
        [halfX, halfZ],
        [-halfX, halfZ],
      ].map(([x, z]) => [
        centerX + x! * cosine - z! * sine,
        centerZ + x! * sine + z! * cosine,
      ] as const),
    };
    halfHeightMeters = object.primitive.sizeMetersXYZ[1] * scaleY / 2;
  } else {
    const radiusMeters = object.primitive.radiusMeters * Math.max(scaleX, scaleZ);
    footprint = {
      kind: "circle",
      centerMetersXZ: [centerX, centerZ],
      radiusMeters,
    };
    halfHeightMeters = object.primitive.kind === "sphere"
      ? object.primitive.radiusMeters * scaleY
      : object.primitive.heightMeters * scaleY / 2;
  }
  return {
    entityId: object.entityId,
    footprint,
    heightRangeMeters: [centerY - halfHeightMeters, centerY + halfHeightMeters],
  };
}

function validateCompiledSpawnFootprintsV3(
  subjects: readonly ExecutionSubjectV3[],
  waters: readonly ExecutionWaterV3[],
  objects: readonly ExecutionObjectV3[],
): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  const blockers = objects
    .filter((object) => object.collisionEnabled)
    .flatMap((object) => {
      const blocker = staticObjectFootprintV3(object);
      return blocker === undefined ? [] : [blocker];
    });
  for (const subject of subjects) {
    const spawnCapsuleFeetPositionMetersXYZ = [
      subject.spawnSubjectOriginPositionMetersXYZ[0] +
        subject.collider.centerOffsetFromSubjectOriginMetersXYZ[0],
      subject.spawnSubjectOriginPositionMetersXYZ[1] +
        subject.collider.centerOffsetFromSubjectOriginMetersXYZ[1] -
        subject.collider.heightMeters / 2,
      subject.spawnSubjectOriginPositionMetersXYZ[2] +
        subject.collider.centerOffsetFromSubjectOriginMetersXYZ[2],
    ] as const;
    for (const water of waters) {
      const result = validateSpawnSafety({
        entityId: subject.entityId,
        position: spawnCapsuleFeetPositionMetersXYZ,
        capsule: {
          radius: subject.collider.radiusMeters,
          height: subject.collider.heightMeters,
        },
        waterSurfaces: [{
          entityId: water.entityId,
          boundary: water.boundary,
          waterLevelMeters: water.waterLevelMeters,
          depthMeters: water.depthMeters,
          traversalMode: water.traversalMode,
        }],
      });
      if (result.some((diagnostic) => diagnostic.code === "SPAWN_IN_BLOCKED_WATER")) {
        diagnostics.push({
          severity: "error",
          code: "COMPILER_SPAWN_IN_BLOCKED_WATER",
          instancePath: `/nodes/${subject.entityId}/spawnAnchorEntityId`,
          message: `Subject '${subject.entityId}' spawn is inside blocked water '${water.entityId}'.`,
          details: {
            subjectEntityId: subject.entityId,
            waterEntityId: water.entityId,
          },
        });
      }
    }
    for (const blocker of blockers) {
      const result = validateSpawnSafety({
        entityId: subject.entityId,
        position: spawnCapsuleFeetPositionMetersXYZ,
        capsule: {
          radius: subject.collider.radiusMeters,
          height: subject.collider.heightMeters,
        },
        staticBlockingObjects: [blocker],
      });
      if (result.some((diagnostic) => diagnostic.code === "SPAWN_INSIDE_STATIC_BLOCKER")) {
        diagnostics.push({
          severity: "error",
          code: "COMPILER_SPAWN_INSIDE_STATIC_BLOCKER",
          instancePath: `/nodes/${subject.entityId}/spawnAnchorEntityId`,
          message: `Subject '${subject.entityId}' spawn is inside static blocking object '${blocker.entityId}'.`,
          details: {
            subjectEntityId: subject.entityId,
            objectEntityId: blocker.entityId,
          },
        });
      }
    }
  }
  return diagnostics;
}

interface CompiledSubjectsV3 {
  subjects: ExecutionSubjectV3[];
  subjectAssets: ExecutionSubjectAssetV1[];
  rigProfiles: ExecutionRigProfileV1[];
  animationSets: ExecutionAnimationSetV1[];
  colliderProfiles: ExecutionColliderProfileV1[];
  resourceCost: { vertices: number; triangles: number; colliders: number };
}

function indexNormalizedResourceRowsV3<T>(
  rows: readonly T[],
  resourceRef: (row: T) => string,
  label: string,
): ReadonlyMap<string, T> {
  const rowsByRef = new Map<string, T>();
  for (const row of [...rows].sort((left, right) =>
    resourceRef(left).localeCompare(resourceRef(right)))) {
    const ref = resourceRef(row);
    if (rowsByRef.has(ref)) {
      throw new Error(
        `NormalizedWorldIR invariant violated: duplicate ${label} '${ref}'.`,
      );
    }
    rowsByRef.set(ref, row);
  }
  return rowsByRef;
}

function requireNormalizedResourceRowV3<T>(
  rowsByRef: ReadonlyMap<string, T>,
  resourceRef: string,
  label: string,
): T {
  const row = rowsByRef.get(resourceRef);
  if (row === undefined) {
    throw new Error(
      `NormalizedWorldIR invariant violated: missing ${label} '${resourceRef}'.`,
    );
  }
  return row;
}

function compileSubjectAssetV1(
  resource: NormalizedSubjectAssetV1,
): ExecutionSubjectAssetV1 {
  return {
    subjectAssetRef: resource.subjectAssetRef,
    artifactContentHash: resource.artifactContentHash,
    byteLength: resource.byteLength,
    mediaType: resource.mediaType,
    format: resource.format,
    inventory: {
      meshCount: resource.inventory.meshCount,
      vertexCount: resource.inventory.vertexCount,
      triangleCount: resource.inventory.triangleCount,
      skeletonCount: resource.inventory.skeletonCount,
      boneCount: resource.inventory.boneCount,
      animationClipNames: [...resource.inventory.animationClipNames],
    },
  };
}

function compileRigProfileV1(
  resource: NormalizedRigProfileV1,
): ExecutionRigProfileV1 {
  for (const boneId of BIPED_BONE_IDS_V1) {
    const hasMapping = Object.prototype.hasOwnProperty.call(
      resource.sourceNodeNameByBoneId,
      boneId,
    );
    const sourceNodeName = resource.sourceNodeNameByBoneId[boneId];
    if (!hasMapping || typeof sourceNodeName !== "string") {
      throw new Error(
        `NormalizedWorldIR invariant violated: Rig Profile '${resource.rigProfileRef}' is missing source-node mapping for Bone '${boneId}'.`,
      );
    }
    if (sourceNodeName.trim().length === 0) {
      throw new Error(
        `NormalizedWorldIR invariant violated: Rig Profile '${resource.rigProfileRef}' has an empty source-node mapping for Bone '${boneId}'.`,
      );
    }
  }
  return {
    rigProfileRef: resource.rigProfileRef,
    bodyTopology: resource.bodyTopology,
    skeletonRootBoneName: resource.skeletonRootBoneName,
    requiredBoneIds: [...resource.requiredBoneIds],
    sourceNodeNameByBoneId: {
      chest: resource.sourceNodeNameByBoneId.chest,
      "foot.left": resource.sourceNodeNameByBoneId["foot.left"],
      "foot.right": resource.sourceNodeNameByBoneId["foot.right"],
      "hand.left": resource.sourceNodeNameByBoneId["hand.left"],
      "hand.right": resource.sourceNodeNameByBoneId["hand.right"],
      head: resource.sourceNodeNameByBoneId.head,
      hips: resource.sourceNodeNameByBoneId.hips,
      "lower-arm.left": resource.sourceNodeNameByBoneId["lower-arm.left"],
      "lower-arm.right": resource.sourceNodeNameByBoneId["lower-arm.right"],
      "lower-leg.left": resource.sourceNodeNameByBoneId["lower-leg.left"],
      "lower-leg.right": resource.sourceNodeNameByBoneId["lower-leg.right"],
      neck: resource.sourceNodeNameByBoneId.neck,
      spine: resource.sourceNodeNameByBoneId.spine,
      "upper-arm.left": resource.sourceNodeNameByBoneId["upper-arm.left"],
      "upper-arm.right": resource.sourceNodeNameByBoneId["upper-arm.right"],
      "upper-leg.left": resource.sourceNodeNameByBoneId["upper-leg.left"],
      "upper-leg.right": resource.sourceNodeNameByBoneId["upper-leg.right"],
    },
  };
}

function compileAnimationSetV1(
  resource: NormalizedAnimationSetV1,
): ExecutionAnimationSetV1 {
  return {
    animationSetRef: resource.animationSetRef,
    subjectAssetRef: resource.subjectAssetRef,
    rigProfileRef: resource.rigProfileRef,
    defaultActionId: resource.defaultActionId,
    requiredActionIds: [...resource.requiredActionIds],
    animationBindings: resource.animationBindings.map((binding) => ({
      actionId: binding.actionId,
      sourceClipName: binding.sourceClipName,
      semanticFamily: binding.semanticFamily,
      automaticPresentationKeys: [...binding.automaticPresentationKeys],
      loopMode: binding.loopMode,
      playbackSpeedRatio: binding.playbackSpeedRatio,
      blendDurationSeconds: binding.blendDurationSeconds,
      rootMotionMode: binding.rootMotionMode,
    })),
  };
}

function compileColliderProfileV1(
  resource: NormalizedColliderProfileV1,
): ExecutionColliderProfileV1 {
  return {
    colliderProfileRef: resource.colliderProfileRef,
    supportedBodyTopologies: [...resource.supportedBodyTopologies],
    collider: {
      kind: resource.collider.kind,
      radiusMeters: resource.collider.radiusMeters,
      heightMeters: resource.collider.heightMeters,
      centerOffsetFromSubjectOriginMetersXYZ: [
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[0],
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[1],
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[2],
      ],
    },
  };
}

function compileSubjectVisualPartV3(
  part: NormalizedSubjectVisualPartV2,
): SubjectVisualPartV3 {
  if (part.kind === "asset") {
    return {
      id: part.id,
      kind: "asset",
      subjectAssetRef: part.subjectAssetRef,
      localTransform: {
        positionMetersXYZ: [
          part.localTransform.positionMetersXYZ[0],
          part.localTransform.positionMetersXYZ[1],
          part.localTransform.positionMetersXYZ[2],
        ],
        rotationEulerRadiansXYZ: [
          part.localTransform.rotationEulerRadiansXYZ[0],
          part.localTransform.rotationEulerRadiansXYZ[1],
          part.localTransform.rotationEulerRadiansXYZ[2],
        ],
        scaleXYZ: [
          part.localTransform.scaleXYZ[0],
          part.localTransform.scaleXYZ[1],
          part.localTransform.scaleXYZ[2],
        ],
      },
      appearance: { mode: "whitebox-neutral" },
      semanticTags: [...part.semanticTags],
    };
  }
  return {
    id: part.id,
    kind: "primitive",
    shape: structuredClone(part.shape),
    localTransform: structuredClone(part.localTransform),
    semanticTags: [...part.semanticTags],
  };
}

function compileSubjectSocketV3(socket: NormalizedSubjectSocketV2): SubjectSocketV3 {
  if (socket.kind === "bone") {
    return {
      id: socket.id,
      kind: "bone",
      boneId: socket.boneId,
      offsetTransform: {
        positionMetersXYZ: [
          socket.offsetTransform.positionMetersXYZ[0],
          socket.offsetTransform.positionMetersXYZ[1],
          socket.offsetTransform.positionMetersXYZ[2],
        ],
        rotationEulerRadiansXYZ: [
          socket.offsetTransform.rotationEulerRadiansXYZ[0],
          socket.offsetTransform.rotationEulerRadiansXYZ[1],
          socket.offsetTransform.rotationEulerRadiansXYZ[2],
        ],
      },
      semanticTags: [...socket.semanticTags],
    };
  }
  return {
    id: socket.id,
    kind: "local",
    localTransform: {
      positionMetersXYZ: [
        socket.localTransform.positionMetersXYZ[0],
        socket.localTransform.positionMetersXYZ[1],
        socket.localTransform.positionMetersXYZ[2],
      ],
      rotationEulerRadiansXYZ: [
        socket.localTransform.rotationEulerRadiansXYZ[0],
        socket.localTransform.rotationEulerRadiansXYZ[1],
        socket.localTransform.rotationEulerRadiansXYZ[2],
      ],
    },
    semanticTags: [...socket.semanticTags],
  };
}

function compileCapabilityAssemblyV1(
  assembly: NonNullable<NormalizedSubjectDefinitionV2["capabilityAssembly"]>,
): NonNullable<ExecutionSubjectV3["capabilityAssembly"]> {
  const compileMotionProfile = (
    profile: typeof assembly.defaultMotionProfile,
  ): NonNullable<ExecutionSubjectV3["capabilityAssembly"]>["defaultMotionProfile"] => ({
    resourceRef: profile.resourceRef,
    contentHash: profile.contentHash,
    motionKernelRef: profile.motionKernelRef,
    motionTags: [...profile.motionTags],
  });
  const compileMotionKernel = (
    motionKernel: typeof assembly.motionKernels[number],
  ): NonNullable<ExecutionSubjectV3["capabilityAssembly"]>["motionKernels"][number] => {
    const implementationId = motionKernel.implementationId;
    if (
      implementationId !== "free-ground" &&
      implementationId !== "forward-steer" &&
      implementationId !== "wheeled-arcade" &&
      implementationId !== "surface-slide" &&
      implementationId !== "water-surface" &&
      implementationId !== "unpowered-glide"
    ) {
      throw new Error(
        `NormalizedWorldIR invariant violated: reserved Motion Kernel '${motionKernel.resourceRef}' cannot enter an Execution Plan.`,
      );
    }
    return {
      resourceRef: motionKernel.resourceRef,
      implementationId,
      commandKind: motionKernel.commandKind,
      supportedMediums: [...motionKernel.supportedMediums],
      fallbackMotionProfileRef: motionKernel.fallbackMotionProfileRef,
      deterministic: true,
    };
  };
  const relationshipProfiles = assembly.relationshipProfiles.map((profile) => {
    if (
      profile.runtimeStatus !== "implemented" ||
      profile.relationshipType !== "mountedOn"
    ) {
      throw new Error(
        `NormalizedWorldIR invariant violated: reserved Relationship Profile '${profile.resourceRef}' cannot enter an Execution Plan.`,
      );
    }
    return {
      resourceRef: profile.resourceRef,
      relationshipType: "mountedOn" as const,
      requiredRiderSocketIds: [...profile.requiredRiderSocketIds],
      requiredMountSocketIds: [...profile.requiredMountSocketIds],
      controlTransferMode: profile.controlTransferMode,
      cameraTargetRole: profile.cameraTargetRole,
      ...(profile.maximumMountDistanceMeters === undefined
        ? {}
        : { maximumMountDistanceMeters: profile.maximumMountDistanceMeters }),
    };
  });
  rejectPublishedWaterMediumProfile(assembly.mediumProfile);
  return {
    authoringAvailability: assembly.authoringAvailability,
    physicsBodyProfileRef: assembly.physicsBodyProfileRef,
    locomotionProfileRef: assembly.locomotionProfileRef,
    defaultMotionProfile: compileMotionProfile(assembly.defaultMotionProfile),
    optionalMotionProfiles: assembly.optionalMotionProfiles.map(compileMotionProfile),
    fallbackMotionProfile: compileMotionProfile(assembly.fallbackMotionProfile),
    motionKernels: assembly.motionKernels.map(compileMotionKernel),
    controlProfile: {
      resourceRef: assembly.controlProfile.resourceRef,
      contentHash: assembly.controlProfile.contentHash,
      commandKind: assembly.controlProfile.commandKind,
      inputSpace: assembly.controlProfile.inputSpace,
      facingPolicy: assembly.controlProfile.facingPolicy,
      lateralMovementPolicy: assembly.controlProfile.lateralMovementPolicy,
      moveDeadzoneRatio: assembly.controlProfile.moveDeadzoneRatio,
    },
    cameraContext: {
      resourceRef: assembly.cameraContextProfile.resourceRef,
      defaultCameraRigProfileRef:
        assembly.cameraContextProfile.defaultCameraRigProfileRef,
      ...(assembly.cameraContextProfile.firstPersonCameraRigProfileRef === undefined
        ? {}
        : {
            firstPersonCameraRigProfileRef:
              assembly.cameraContextProfile.firstPersonCameraRigProfileRef,
          }),
      rules: structuredClone(assembly.cameraContextProfile.rules),
      cameraRigProfiles: assembly.cameraRigProfiles.map((profile) => ({
        resourceRef: profile.resourceRef,
        contentHash: profile.contentHash,
        baseMode: profile.baseMode,
        algorithmRef: profile.algorithmRef,
        headingSource: profile.headingSource,
        reverseHeadingPolicy: profile.reverseHeadingPolicy,
        recenterMode: profile.recenterMode,
        preferredSocketIds: [...profile.preferredSocketIds],
        parameters: structuredClone(profile.parameters),
        authoringRanges: structuredClone(profile.authoringRanges ?? {}),
      })),
      cameraModifierProfiles: assembly.cameraModifierProfiles.map((modifier) => ({
        resourceRef: modifier.resourceRef,
        parameterOverrides: structuredClone(modifier.parameterOverrides),
        ...(modifier.headingSourceOverride === undefined
          ? {}
          : { headingSourceOverride: modifier.headingSourceOverride }),
        ...(modifier.reverseHeadingPolicyOverride === undefined
          ? {}
          : { reverseHeadingPolicyOverride: modifier.reverseHeadingPolicyOverride }),
        ...(modifier.recenterModeOverride === undefined
          ? {}
          : { recenterModeOverride: modifier.recenterModeOverride }),
      })),
    },
    mediumProfile: {
      resourceRef: assembly.mediumProfile.resourceRef,
      air: {
        gravityRatio: assembly.mediumProfile.air.gravityRatio,
        linearDragPerSecond: assembly.mediumProfile.air.linearDragPerSecond,
      },
    },
    relationshipProfiles,
    harnessProfileRef: assembly.harnessProfile.resourceRef,
    requiredHarnessCheckIds: [...assembly.harnessProfile.requiredCheckIds],
    actionOrPoseSetRef: assembly.actionOrPoseSetRef,
    renderBindingProfileRef: assembly.renderBindingProfile.resourceRef,
  };
}

function colliderProfileMatchesDefinitionV3(
  profile: NormalizedColliderProfileV1,
  definitionCollider: ExecutionSubjectV3["collider"],
): boolean {
  const profileCollider = profile.collider;
  return profileCollider.kind === definitionCollider.kind &&
    profileCollider.radiusMeters === definitionCollider.radiusMeters &&
    profileCollider.heightMeters === definitionCollider.heightMeters &&
    profileCollider.centerOffsetFromSubjectOriginMetersXYZ.every(
      (component, index) =>
        component === definitionCollider.centerOffsetFromSubjectOriginMetersXYZ[index],
    );
}

function compileSubjectsV3(
  world: NormalizedWorldCompileView,
): CompiledSubjectsV3 {
  const definitionsByRef = new Map(
    world.resources.subjectDefinitions.map((definition) => [
      definition.subjectDefinitionRef,
      definition,
    ]),
  );
  const subjectAssetsByRef = indexNormalizedResourceRowsV3(
    world.resources.subjectAssets,
    (resource) => resource.subjectAssetRef,
    "Subject Asset",
  );
  const rigProfilesByRef = indexNormalizedResourceRowsV3(
    world.resources.rigProfiles,
    (resource) => resource.rigProfileRef,
    "Rig Profile",
  );
  const animationSetsByRef = indexNormalizedResourceRowsV3(
    world.resources.animationSets,
    (resource) => resource.animationSetRef,
    "Animation Set",
  );
  const colliderProfilesByRef = indexNormalizedResourceRowsV3(
    world.resources.colliderProfiles,
    (resource) => resource.colliderProfileRef,
    "Collider Profile",
  );
  const anchorsByEntityId = new Map(
    world.nodes
      .filter(
        (node): node is Extract<NormalizedWorldNodeV4, { kind: "anchor" }> =>
          node.kind === "anchor",
      )
      .map((anchor) => [anchor.id, anchor]),
  );
  const reachableSubjectAssetsByRef = new Map<string, NormalizedSubjectAssetV1>();
  const reachableRigProfilesByRef = new Map<string, NormalizedRigProfileV1>();
  const reachableAnimationSetsByRef = new Map<string, NormalizedAnimationSetV1>();
  const reachableColliderProfilesByRef = new Map<string, NormalizedColliderProfileV1>();
  const resourceCost = { vertices: 0, triangles: 0, colliders: 0 };

  const subjects = world.nodes
    .filter(
      (node): node is Extract<NormalizedWorldNodeV4, { kind: "subject" }> =>
        node.kind === "subject",
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node): ExecutionSubjectV3 => {
      const definition = definitionsByRef.get(node.subjectDefinitionRef);
      if (definition === undefined) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Subject '${node.id}' references missing Definition '${node.subjectDefinitionRef}'.`,
        );
      }
      const spawnAnchor = anchorsByEntityId.get(node.spawnAnchorEntityId);
      if (spawnAnchor === undefined) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Subject '${node.id}' references missing Spawn Anchor '${node.spawnAnchorEntityId}'.`,
        );
      }
      if (!definition.capabilityRefs.includes(definition.locomotionCapabilityRef)) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Subject '${node.id}' does not select its locomotion Capability.`,
        );
      }
      const locomotionCapabilityLockRows = world.resources.resourceLock.filter(
        (row) => row.resourceRef === definition.locomotionCapabilityRef,
      );
      if (
        locomotionCapabilityLockRows.length !== 1 ||
        locomotionCapabilityLockRows[0]?.resourceKind !== "capability" ||
        locomotionCapabilityLockRows[0]?.contentHash !==
          definition.locomotionCapabilityHash
      ) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Subject '${node.id}' requires one matching locked locomotion Capability.`,
        );
      }
      const locomotionCapabilityLock = locomotionCapabilityLockRows[0];
      if (isNil(locomotionCapabilityLock)) {
        throw new Error(
          `NormalizedWorldIR invariant violated: Subject '${node.id}' is missing its locked locomotion Capability.`,
        );
      }

      resourceCost.vertices += definition.resourceCost.vertices;
      resourceCost.triangles += definition.resourceCost.triangles;
      resourceCost.colliders += definition.resourceCost.colliders;

      const assetParts = definition.visualParts.filter(
        (part) => part.kind === "asset",
      );
      for (const assetPart of assetParts) {
        const subjectAsset = requireNormalizedResourceRowV3(
          subjectAssetsByRef,
          assetPart.subjectAssetRef,
          "Subject Asset",
        );
        const subjectAssetLockRows = world.resources.resourceLock.filter(
          (row) => row.resourceRef === subjectAsset.subjectAssetRef,
        );
        if (
          subjectAssetLockRows.length !== 1 ||
          subjectAssetLockRows[0]?.resourceKind !== "subject-asset"
        ) {
          throw new Error(
            `NormalizedWorldIR invariant violated: Subject Asset '${subjectAsset.subjectAssetRef}' requires one matching locked Subject Asset.`,
          );
        }
        if (
          subjectAssetLockRows[0].contentHash !==
            subjectAsset.subjectAssetManifestHash
        ) {
          throw new Error(
            `NormalizedWorldIR invariant violated: Subject Asset '${subjectAsset.subjectAssetRef}' does not match its locked Registry manifest hash.`,
          );
        }
        reachableSubjectAssetsByRef.set(subjectAsset.subjectAssetRef, subjectAsset);
      }

      if (definition.visualBinding.mode === "rigged") {
        if (assetParts.length !== 1) {
          throw new Error(
            `NormalizedWorldIR invariant violated: rigged Subject '${node.id}' must select exactly one Subject Asset.`,
          );
        }
        const subjectAssetRef = assetParts[0]!.subjectAssetRef;
        const rigProfile = requireNormalizedResourceRowV3(
          rigProfilesByRef,
          definition.visualBinding.rigProfileRef,
          "Rig Profile",
        );
        const animationSet = requireNormalizedResourceRowV3(
          animationSetsByRef,
          definition.visualBinding.animationSetRef,
          "Animation Set",
        );
        if (rigProfile.bodyTopology !== definition.bodyTopology) {
          throw new Error(
            `NormalizedWorldIR invariant violated: Rig Profile '${rigProfile.rigProfileRef}' has topology '${rigProfile.bodyTopology}', but Subject '${node.id}' has '${definition.bodyTopology}'.`,
          );
        }
        if (animationSet.subjectAssetRef !== subjectAssetRef) {
          throw new Error(
            `NormalizedWorldIR invariant violated: Animation Set '${animationSet.animationSetRef}' targets Subject Asset '${animationSet.subjectAssetRef}', but Subject '${node.id}' selects '${subjectAssetRef}'.`,
          );
        }
        if (animationSet.rigProfileRef !== rigProfile.rigProfileRef) {
          throw new Error(
            `NormalizedWorldIR invariant violated: Animation Set '${animationSet.animationSetRef}' targets Rig Profile '${animationSet.rigProfileRef}', but Subject '${node.id}' selects '${rigProfile.rigProfileRef}'.`,
          );
        }
        const requiredBoneIds = new Set(rigProfile.requiredBoneIds);
        const missingSocketBone = definition.sockets.find(
          (socket) => socket.kind === "bone" && !requiredBoneIds.has(socket.boneId),
        );
        if (missingSocketBone?.kind === "bone") {
          throw new Error(
            `NormalizedWorldIR invariant violated: Bone Socket '${missingSocketBone.id}' targets undeclared Bone '${missingSocketBone.boneId}'.`,
          );
        }
        reachableRigProfilesByRef.set(rigProfile.rigProfileRef, rigProfile);
        reachableAnimationSetsByRef.set(animationSet.animationSetRef, animationSet);
      } else {
        if (assetParts.length > 1) {
          throw new Error(
            `NormalizedWorldIR invariant violated: static Subject '${node.id}' supports at most one Subject Asset.`,
          );
        }
        const staticBinding = definition.visualBinding;
        if (
          definition.sockets.some((socket) => socket.kind === "bone") ||
          Object.prototype.hasOwnProperty.call(staticBinding, "rigProfileRef") ||
          Object.prototype.hasOwnProperty.call(staticBinding, "animationSetRef")
        ) {
          throw new Error(
            `NormalizedWorldIR invariant violated: static Subject '${node.id}' contains rigged visual data.`,
          );
        }
      }

      if (definition.colliderPolicy.kind === "profile") {
        const colliderProfile = requireNormalizedResourceRowV3(
          colliderProfilesByRef,
          definition.colliderPolicy.colliderProfileRef,
          "Collider Profile",
        );
        if (!colliderProfile.supportedBodyTopologies.includes(definition.bodyTopology)) {
          throw new Error(
            `NormalizedWorldIR invariant violated: Collider Profile '${colliderProfile.colliderProfileRef}' does not support Subject '${node.id}' topology '${definition.bodyTopology}'.`,
          );
        }
        if (!colliderProfileMatchesDefinitionV3(colliderProfile, definition.collider)) {
          throw new Error(
            `NormalizedWorldIR invariant violated: Collider Profile '${colliderProfile.colliderProfileRef}' does not match Subject '${node.id}' collider.`,
          );
        }
        reachableColliderProfilesByRef.set(
          colliderProfile.colliderProfileRef,
          colliderProfile,
        );
      }

      return {
        entityId: node.id,
        subjectDefinitionRef: definition.subjectDefinitionRef,
        subjectDefinitionHash: definition.subjectDefinitionHash,
        bodyTopology: definition.bodyTopology,
        semanticClassId: definition.semanticClassId,
        spawnAnchorEntityId: spawnAnchor.id,
        spawnSubjectOriginPositionMetersXYZ: [
          ...spawnAnchor.transform.positionMetersXYZ,
        ],
        spawnSubjectFacingRadians:
          spawnAnchor.transform.rotationEulerRadiansXYZ[1],
        forwardDirection: "-z",
        visualParts: definition.visualParts.map(compileSubjectVisualPartV3),
        visualBinding: definition.visualBinding.mode === "static"
          ? { mode: "static" }
          : {
              mode: "rigged",
              rigProfileRef: definition.visualBinding.rigProfileRef,
              animationSetRef: definition.visualBinding.animationSetRef,
            },
        sockets: definition.sockets.map(compileSubjectSocketV3),
        mountSlots: definition.mountSlots.map((slot) => ({
          id: slot.id,
          kind: slot.kind,
          mode: slot.mode,
          mountSocketId: slot.mountSocketId,
          riderSubjectOriginOffsetMetersXYZ: [
            ...slot.riderSubjectOriginOffsetMetersXYZ,
          ],
          dismountCandidateOffsetsMetersXYZ:
            slot.dismountCandidateOffsetsMetersXYZ.map((offset) => [...offset]),
        })),
        collider: {
          kind: definition.collider.kind,
          radiusMeters: definition.collider.radiusMeters,
          heightMeters: definition.collider.heightMeters,
          centerOffsetFromSubjectOriginMetersXYZ: [
            definition.collider.centerOffsetFromSubjectOriginMetersXYZ[0],
            definition.collider.centerOffsetFromSubjectOriginMetersXYZ[1],
            definition.collider.centerOffsetFromSubjectOriginMetersXYZ[2],
          ],
          massKilograms: definition.collider.massKilograms,
          maxSlopeDegrees: definition.collider.maxSlopeDegrees,
          maxStepHeightMeters: definition.collider.maxStepHeightMeters,
        },
        locomotion: {
          allowWalk: definition.locomotion.allowWalk,
          allowRun: definition.locomotion.allowRun,
          allowJump: definition.locomotion.allowJump,
        },
        locomotionCapabilityRef: locomotionCapabilityLock.resourceRef,
        locomotionCapabilityHash: locomotionCapabilityLock.contentHash,
        physicsBodyProfileRef: definition.profiles.physicsBodyProfileRef,
        locomotionProfileRef: definition.profiles.locomotionProfileRef,
        controlFeel: {
          resourceRef: definition.controlFeel.resourceRef,
          contentHash: definition.controlFeel.contentHash,
          walkSpeedMetersPerSecond: definition.controlFeel.walkSpeedMetersPerSecond,
          runSpeedMetersPerSecond: definition.controlFeel.runSpeedMetersPerSecond,
          jumpSpeedMetersPerSecond: definition.controlFeel.jumpSpeedMetersPerSecond,
          accelerationMetersPerSecondSquared:
            definition.controlFeel.accelerationMetersPerSecondSquared,
          decelerationMetersPerSecondSquared:
            definition.controlFeel.decelerationMetersPerSecondSquared,
          turnRateRadiansPerSecond: definition.controlFeel.turnRateRadiansPerSecond,
          moveResponseExponent: definition.controlFeel.moveResponseExponent,
          airControlRatio: definition.controlFeel.airControlRatio,
          coyoteTimeSeconds: definition.controlFeel.coyoteTimeSeconds,
          jumpBufferSeconds: definition.controlFeel.jumpBufferSeconds,
          variableJumpHoldSeconds: definition.controlFeel.variableJumpHoldSeconds,
          jumpHoldGravityRatio: definition.controlFeel.jumpHoldGravityRatio,
          jumpReleaseGravityRatio: definition.controlFeel.jumpReleaseGravityRatio,
        },
        availableControlFeels: definition.availableControlFeels.map((feel) => ({
          resourceRef: feel.resourceRef,
          contentHash: feel.contentHash,
          walkSpeedMetersPerSecond: feel.walkSpeedMetersPerSecond,
          runSpeedMetersPerSecond: feel.runSpeedMetersPerSecond,
          jumpSpeedMetersPerSecond: feel.jumpSpeedMetersPerSecond,
          accelerationMetersPerSecondSquared:
            feel.accelerationMetersPerSecondSquared,
          decelerationMetersPerSecondSquared:
            feel.decelerationMetersPerSecondSquared,
          turnRateRadiansPerSecond: feel.turnRateRadiansPerSecond,
          moveResponseExponent: feel.moveResponseExponent,
          airControlRatio: feel.airControlRatio,
          coyoteTimeSeconds: feel.coyoteTimeSeconds,
          jumpBufferSeconds: feel.jumpBufferSeconds,
          variableJumpHoldSeconds: feel.variableJumpHoldSeconds,
          jumpHoldGravityRatio: feel.jumpHoldGravityRatio,
          jumpReleaseGravityRatio: feel.jumpReleaseGravityRatio,
        })),
        capabilityAssembly: compileCapabilityAssemblyV1(
          definition.capabilityAssembly,
        ),
      };
    })
    .sort((left, right) => left.entityId.localeCompare(right.entityId));

  if (subjects.length === 0) {
    throw new Error(
      "NormalizedWorldIR invariant violated: no Subject nodes were materialized.",
    );
  }
  return {
    subjects,
    subjectAssets: [...reachableSubjectAssetsByRef.values()]
      .sort((left, right) => left.subjectAssetRef.localeCompare(right.subjectAssetRef))
      .map(compileSubjectAssetV1),
    rigProfiles: [...reachableRigProfilesByRef.values()]
      .sort((left, right) => left.rigProfileRef.localeCompare(right.rigProfileRef))
      .map(compileRigProfileV1),
    animationSets: [...reachableAnimationSetsByRef.values()]
      .sort((left, right) => left.animationSetRef.localeCompare(right.animationSetRef))
      .map(compileAnimationSetV1),
    colliderProfiles: [...reachableColliderProfilesByRef.values()]
      .sort((left, right) =>
        left.colliderProfileRef.localeCompare(right.colliderProfileRef))
      .map(compileColliderProfileV1),
    resourceCost,
  };
}

function primitiveResourceCostV3(
  primitive: ExecutionObjectPrimitiveV3,
): { vertices: number; triangles: number } {
  switch (primitive.kind) {
    case "box":
      return { vertices: 24, triangles: 12 };
    case "sphere":
      return { vertices: 289, triangles: 512 };
    case "cylinder":
      return { vertices: 70, triangles: 128 };
    case "cone":
      return { vertices: 36, triangles: 64 };
  }
}

function waterResourceCostV3(
  boundary: ExecutionWaterBoundaryV3,
): { vertices: number; triangles: number } {
  const vertices =
    boundary.kind === "polygon" ? boundary.pointsMetersXZ.length : 64;
  return { vertices: vertices + 1, triangles: vertices };
}

function pushBudgetDiagnosticV3(
  diagnostics: CompileDiagnostic[],
  field: "maxVertices" | "maxTriangles" | "maxColliders",
  actual: number,
  maximum: number,
): void {
  if (actual <= maximum) return;
  diagnostics.push({
    severity: "error",
    code: "COMPILER_RESOURCE_BUDGET_EXCEEDED",
    instancePath: `/world/resourceBudget/${field}`,
    message: `${field} budget is ${maximum}, but the compiled world requires ${actual}.`,
    details: { actual, maximum },
  });
}

function compileWorldCore(input: CompileWorldCoreInput): CompileWorldCoreResult {
  const world = input.normalizedWorldIr;
  try {
    const terrain = compileTerrainV3(world);
    const waters = compileWatersV3(world, terrain);
    const objects = compileObjectsV3(world);
    const {
      subjects,
      subjectAssets,
      rigProfiles,
      animationSets,
      colliderProfiles,
      resourceCost: subjectResourceCost,
    } = compileSubjectsV3(world);
    const spawnDiagnostics = validateCompiledSpawnFootprintsV3(
      subjects,
      waters,
      objects,
    );
    if (spawnDiagnostics.length > 0) {
      return { ok: false, diagnostics: spawnDiagnostics };
    }
    const cameraNode = findOnlyNodeV4(world.nodes, "camera");
    const terrainVertices =
      terrain.resolutionCellsXZ[0] * terrain.resolutionCellsXZ[1];
    const terrainTriangles =
      (terrain.resolutionCellsXZ[0] - 1) *
      (terrain.resolutionCellsXZ[1] - 1) *
      2;
    const objectCosts = objects.map((object) =>
      primitiveResourceCostV3(object.primitive),
    );
    const waterCosts = waters.map((water) => waterResourceCostV3(water.boundary));
    const usage = {
      vertices:
        terrainVertices +
        subjectResourceCost.vertices +
        [...objectCosts, ...waterCosts].reduce(
          (sum, cost) => sum + cost.vertices,
          0,
        ),
      triangles:
        terrainTriangles +
        subjectResourceCost.triangles +
        [...objectCosts, ...waterCosts].reduce(
          (sum, cost) => sum + cost.triangles,
          0,
        ),
      colliders:
        1 +
        subjectResourceCost.colliders +
        objects.filter((object) => object.collisionEnabled).length,
    };
    const diagnostics: CompileDiagnostic[] = [];
    const budget = world.world.resourceBudget;
    pushBudgetDiagnosticV3(
      diagnostics,
      "maxVertices",
      usage.vertices,
      budget.maxVertices,
    );
    pushBudgetDiagnosticV3(
      diagnostics,
      "maxTriangles",
      usage.triangles,
      budget.maxTriangles,
    );
    pushBudgetDiagnosticV3(
      diagnostics,
      "maxColliders",
      usage.colliders,
      budget.maxColliders,
    );
    if (diagnostics.length > 0) return { ok: false, diagnostics };

    const rig = cameraNode.components.cameraRig;
    const components: CompiledWorldComponents = {
      id: world.id,
      seed: world.seed,
      runtimeBackend: "babylon-havok",
      coordinateSystem: world.world.coordinateSystem,
      gravityMetersPerSecondSquaredXYZ: [
        ...world.world.gravityMetersPerSecondSquaredXYZ,
      ],
      atmospherePreset: world.world.environment.preset,
      terrain,
      waters,
      objects,
      subjectAssets,
      rigProfiles,
      animationSets,
      colliderProfiles,
      controlledEntityId: world.startup.controlledEntityId,
      subjects,
      camera: {
        cameraEntityId: cameraNode.id,
        rigRef: "worldkit://camera/third-person.standard@1",
        targetEntityId: rig.target.targetEntityId,
        pitchRadians: rig.thirdPerson.pitchRadians,
        distanceMeters: rig.thirdPerson.distanceMeters,
        targetHeightMeters:
          rig.target.targetHeightMeters ?? rig.thirdPerson.targetHeightMeters,
        fovDegrees: rig.thirdPerson.fovDegrees,
        aspectRatio: rig.thirdPerson.aspectRatio,
        manualSwitchAllowed: rig.manualSwitchAllowed,
      },
      resourceUsage: usage,
    };
    return {
      ok: true,
      components,
      diagnostics: [],
    };
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "COMPILER_NORMALIZED_IR_INVALID",
          instancePath: "/normalizedWorldIr",
          message:
            cause instanceof Error
              ? cause.message
              : "NormalizedWorldIR could not be compiled.",
        },
      ],
    };
  }
}

function projectPrimitiveRecord(
  value: Readonly<Record<string, number | boolean | string>>,
  allowedKeys: readonly string[],
): Readonly<Record<string, number | boolean | string>> {
  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const candidate = value[key];
      return typeof candidate === "number" || typeof candidate === "boolean" || typeof candidate === "string"
        ? [[key, candidate] as const]
        : [];
    }),
  );
}

function projectNumericRecord(
  value: Readonly<Record<string, number>>,
  allowedKeys: readonly string[],
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const candidate = value[key];
      return typeof candidate === "number" && Number.isFinite(candidate)
        ? [[key, candidate] as const]
        : [];
    }),
  );
}

function assertionMeasurementKeys(
  kind: NormalizedLayoutAssertionV1["kind"],
): readonly string[] {
  switch (kind) {
    case "inside-region":
      return ["isInside", "minimumBoundaryClearanceMeters"];
    case "outside-region":
      return ["intersectsRegion", "minimumBoundaryClearanceMeters"];
    case "distance-range":
      return ["distanceMeters"];
    case "faces-entity":
      return ["angularDeviationDegrees"];
    case "supported-by":
      return ["maximumSupportGapMeters", "supportRatio"];
    case "minimum-clearance":
      return ["hasOverlap", "minimumClearanceMeters"];
    case "within-slope-limit":
      return ["maximumSlopeDegrees", "sampledPointCount", "sampledLateralOffsetCount"];
    case "visible-in-camera-region":
      return ["projectedAreaRatio", "visibleRatio", "isOccluded", "cameraTargetAnchorEntityId"];
  }
}

function assertionToleranceKeys(
  kind: NormalizedLayoutAssertionV1["kind"],
): readonly string[] {
  switch (kind) {
    case "inside-region":
    case "outside-region":
    case "distance-range":
      return ["distanceMeters"];
    case "faces-entity":
    case "within-slope-limit":
      return ["angleDegrees"];
    case "supported-by":
      return ["supportGapMeters"];
    case "minimum-clearance":
      return ["overlapMeters"];
    case "visible-in-camera-region":
      return ["ratio"];
  }
}

function assertionBase(
  assertion: NormalizedLayoutAssertionV1,
): Pick<ExecutionLayoutAssertionV1, "constraintId" | "evidenceEntityIds" | "measurements" | "tolerances"> {
  return {
    constraintId: assertion.constraintId,
    evidenceEntityIds: [...assertion.evidenceEntityIds],
    measurements: projectPrimitiveRecord(
      assertion.measurements,
      assertionMeasurementKeys(assertion.kind),
    ),
    tolerances: projectNumericRecord(
      assertion.tolerances,
      assertionToleranceKeys(assertion.kind),
    ),
  };
}

function projectLayoutAssertionV1(
  assertion: NormalizedLayoutAssertionV1,
): ExecutionLayoutAssertionV1 {
  const base = assertionBase(assertion);
  switch (assertion.kind) {
    case "inside-region":
    case "outside-region":
      return { ...base, kind: assertion.kind, entityId: assertion.entityId, regionId: assertion.regionId, boundaryClearanceMeters: assertion.boundaryClearanceMeters };
    case "distance-range":
      return { ...base, kind: assertion.kind, entityId: assertion.entityId, referenceEntityId: assertion.referenceEntityId, minimumDistanceMeters: assertion.minimumDistanceMeters, maximumDistanceMeters: assertion.maximumDistanceMeters };
    case "faces-entity":
      return { ...base, kind: assertion.kind, facingEntityId: assertion.facingEntityId, targetEntityId: assertion.targetEntityId, maximumAngularDeviationDegrees: assertion.maximumAngularDeviationDegrees };
    case "supported-by":
      return { ...base, kind: assertion.kind, supportedEntityId: assertion.supportedEntityId, supportingEntityId: assertion.supportingEntityId, maximumSupportGapMeters: assertion.maximumSupportGapMeters, minimumSupportRatio: assertion.minimumSupportRatio };
    case "minimum-clearance":
      return assertion.otherEntityIds === undefined
        ? { ...base, kind: assertion.kind, entityId: assertion.entityId, semanticClassIds: [...assertion.semanticClassIds], clearanceMeters: assertion.clearanceMeters }
        : { ...base, kind: assertion.kind, entityId: assertion.entityId, otherEntityIds: [...assertion.otherEntityIds], clearanceMeters: assertion.clearanceMeters };
    case "within-slope-limit":
      return assertion.entityId === undefined
        ? { ...base, kind: assertion.kind, terrainEntityId: assertion.terrainEntityId, routeId: assertion.routeId, maximumSlopeDegrees: assertion.maximumSlopeDegrees }
        : { ...base, kind: assertion.kind, terrainEntityId: assertion.terrainEntityId, entityId: assertion.entityId, maximumSlopeDegrees: assertion.maximumSlopeDegrees };
    case "visible-in-camera-region":
      return { ...base, kind: assertion.kind, visibleEntityId: assertion.visibleEntityId, cameraEntityId: assertion.cameraEntityId, screenRegionId: assertion.screenRegionId, minimumVisibleRatio: assertion.minimumVisibleRatio, minimumProjectedAreaRatio: assertion.minimumProjectedAreaRatio };
  }
}

function projectPlacementV1(
  node: Extract<NormalizedWorldIRV4["nodes"][number], { kind: "object" | "anchor" }>,
): ExecutionLayoutPlacementV1 {
  return {
    entityId: node.id,
    transform: {
      positionMetersXYZ: [...node.transform.positionMetersXYZ],
      rotationEulerRadiansXYZ: [...node.transform.rotationEulerRadiansXYZ],
      scaleXYZ: [...node.transform.scaleXYZ],
    },
    placementProvenance: {
      kind: node.placementProvenance.kind,
      candidateId: node.placementProvenance.candidateId,
      placementConstraintIds: [...node.placementProvenance.placementConstraintIds],
      solverProfileRef: node.placementProvenance.solverProfileRef,
      layoutSolveReportHash: node.placementProvenance.layoutSolveReportHash,
    },
  };
}

type NormalizedLayoutCompileView = Readonly<{
  nodes: NormalizedWorldIRV4["nodes"];
  layout: Pick<
    NormalizedWorldIRV4["layout"],
    | "solverProfileRef"
    | "resolvedVersion"
    | "solverProfileHash"
    | "layoutSolveReportHash"
    | "regions"
    | "routes"
    | "screenRegions"
    | "heightfields"
    | "assertions"
  >;
}>;

function compileLockedTerrainV4(
  world: Pick<NormalizedLayoutCompileView, "layout">,
  baseline: ExecutionTerrainV3,
): ExecutionTerrainV3 {
  const heightfield = world.layout.heightfields.find((row) => row.terrainEntityId === baseline.entityId);
  if (heightfield === undefined) throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_MISSING");
  const expectedLength = heightfield.resolutionVerticesXZ[0] * heightfield.resolutionVerticesXZ[1];
  if (
    heightfield.heightSamplesMeters.length !== expectedLength ||
    heightfield.heightSamplesMeters.some((value) => !Number.isFinite(value))
  ) throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_INVALID");
  const heightSamplesMeters = [...heightfield.heightSamplesMeters];
  const heightSamplesHash = sha256CanonicalJson(heightSamplesMeters);
  if (heightSamplesHash !== baseline.heightSamplesHash) {
    throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_MISMATCH");
  }
  const minimumHeightMeters = min(heightSamplesMeters);
  const maximumHeightMeters = max(heightSamplesMeters);
  if (isNil(minimumHeightMeters) || isNil(maximumHeightMeters)) {
    throw new Error("COMPILER_LAYOUT_HEIGHTFIELD_INVALID");
  }
  return {
    entityId: baseline.entityId,
    centerMetersXZ: [...heightfield.centerMetersXZ],
    sizeMetersXZ: [...heightfield.sizeMetersXZ],
    resolutionCellsXZ: [...heightfield.resolutionVerticesXZ],
    heightSamplesMeters,
    heightSamplesHash,
    minimumHeightMeters,
    maximumHeightMeters,
    semanticClassId: baseline.semanticClassId,
  };
}

function compileExecutionLayoutV1(
  world: NormalizedLayoutCompileView,
): ExecutionPlanV5["layout"] {
  const placements = world.nodes
    .filter((node): node is Extract<typeof node, { kind: "object" | "anchor" }> =>
      node.kind === "object" || node.kind === "anchor")
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const node of placements) {
    if (
      node.placementProvenance.layoutSolveReportHash !==
        world.layout.layoutSolveReportHash ||
      node.placementProvenance.solverProfileRef !== world.layout.solverProfileRef
    ) {
      throw new Error("COMPILER_LAYOUT_PROVENANCE_MISMATCH");
    }
  }
  return {
    solverProfileRef: world.layout.solverProfileRef,
    resolvedVersion: world.layout.resolvedVersion,
    solverProfileHash: world.layout.solverProfileHash,
    layoutSolveReportHash: world.layout.layoutSolveReportHash,
    regions: [...world.layout.regions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((region) => ({
        id: region.id,
        kind: region.kind,
        pointsMetersXZ: region.pointsMetersXZ.map((point) => [...point]),
        ...(region.minimumHeightMeters === undefined
          ? {}
          : { minimumHeightMeters: region.minimumHeightMeters }),
        ...(region.maximumHeightMeters === undefined
          ? {}
          : { maximumHeightMeters: region.maximumHeightMeters }),
        semanticClassId: region.semanticClassId,
      })),
    routes: [...world.layout.routes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((route) => ({
        id: route.id,
        kind: route.kind,
        pointsMetersXZ: route.pointsMetersXZ.map((point) => [...point]),
        widthMeters: route.widthMeters,
        locomotionProfileRef: route.locomotionProfileRef,
      })),
    screenRegions: [...world.layout.screenRegions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((region) => ({
        id: region.id,
        kind: region.kind,
        minimumUv: [...region.minimumUv],
        maximumUv: [...region.maximumUv],
      })),
    placementsByEntityId: Object.fromEntries(placements.map((node) => [
      node.id,
      projectPlacementV1(node),
    ])),
    layoutAssertions: [...world.layout.assertions]
      .sort((left, right) => left.constraintId.localeCompare(right.constraintId))
      .map(projectLayoutAssertionV1),
  };
}

function compileTraversalAreaV1(
  area: NormalizedWorldIRV4["layout"]["traversalAreas"][number],
): ExecutionTraversalAreaV1 {
  return {
    id: area.id,
    kind: area.kind,
    pointsMetersXZ: area.pointsMetersXZ.map((point) => [...point]),
    surfaceEntityId: area.surfaceEntityId,
    mode: area.mode,
  };
}

function compileHeightfieldTraversalSurfaceV1(
  terrain: ExecutionTerrainV3,
): ExecutionHeightfieldTraversalSurfaceV1 {
  const surfaceEntityId = terrain.entityId;
  const colliderSubshapeId = deriveColliderSubshapeIdV1(
    surfaceEntityId,
    "heightfield",
  );
  return {
    kind: "heightfield",
    traversalSurfaceId: `traversal-surface:${sha256CanonicalJson({
      surfaceEntityId,
      logicalSubshapeId: "heightfield",
    })}`,
    surfaceEntityId,
    colliderSubshapeId,
    resourceRef: `package://traversal-surface/${surfaceEntityId}.heightfield@1`,
    resolvedVersion: "1",
    resourceHash: sha256CanonicalJson({
      surfaceEntityId,
      centerMetersXZ: terrain.centerMetersXZ,
      sizeMetersXZ: terrain.sizeMetersXZ,
      resolutionCellsXZ: terrain.resolutionCellsXZ,
      heightSamplesMeters: terrain.heightSamplesMeters,
    }) as `sha256:${string}`,
  };
}

function staticColliderShapeV1(
  primitive: ExecutionObjectV3["primitive"],
): ExecutionStaticColliderShapeV1 {
  switch (primitive.kind) {
    case "box":
      return { kind: "box", sizeMetersXYZ: [...primitive.sizeMetersXYZ] };
    case "sphere":
      return { kind: "sphere", radiusMeters: primitive.radiusMeters };
    case "cylinder":
    case "cone":
      return {
        kind: "cylinder",
        radiusMeters: primitive.radiusMeters,
        heightMeters: primitive.heightMeters,
      };
  }
}

function compileStaticColliderV1(
  object: ExecutionObjectV3,
): ExecutionStaticColliderV1 {
  const logicalSubshapeId = "primary";
  const colliderSubshapeId = deriveColliderSubshapeIdV1(
    object.entityId,
    logicalSubshapeId,
  );
  const hashInput = {
    entityId: object.entityId,
    logicalSubshapeId,
    colliderSubshapeId,
    transform: structuredClone(object.transform),
    shape: staticColliderShapeV1(object.primitive),
  };
  return {
    ...hashInput,
    colliderHash: sha256CanonicalJson(hashInput) as `sha256:${string}`,
  };
}

const PROTOTYPE_TRAVERSAL_SURFACE_BINDING_FIELDS_V1 = [
  "id",
  "kind",
  "logicalSubshapeId",
  "traversalSurfaceProfileRef",
] as const;
const PROTOTYPE_TRAVERSAL_SURFACE_BINDING_ID_PATTERN_V1 =
  /^[a-z0-9][a-z0-9.-]{0,63}$/;
const TRAVERSAL_SURFACE_PROFILE_REF_PATTERN_V1 =
  /^worldkit:\/\/traversal-surface-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/;

function canonicalPrototypeTraversalSurfaceBindingV1(
  value: unknown,
  prototypeId: string,
): PrototypeTraversalSurfaceBindingV1 {
  if (isNil(value) || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Traversal Surface binding '${prototypeId}.<unknown>' is invalid.`,
    );
  }
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record).sort();
  const expectedFields = [
    ...PROTOTYPE_TRAVERSAL_SURFACE_BINDING_FIELDS_V1,
  ].sort();
  const bindingId = typeof record.id === "string" ? record.id : "<unknown>";
  if (
    fields.length !== expectedFields.length ||
    fields.some((field, index) => field !== expectedFields[index]) ||
    typeof record.id !== "string" ||
    !PROTOTYPE_TRAVERSAL_SURFACE_BINDING_ID_PATTERN_V1.test(record.id) ||
    record.kind !== "collider-subshape" ||
    typeof record.logicalSubshapeId !== "string" ||
    !PROTOTYPE_TRAVERSAL_SURFACE_BINDING_ID_PATTERN_V1.test(
      record.logicalSubshapeId,
    ) ||
    typeof record.traversalSurfaceProfileRef !== "string" ||
    !TRAVERSAL_SURFACE_PROFILE_REF_PATTERN_V1.test(
      record.traversalSurfaceProfileRef,
    )
  ) {
    throw new Error(
      `Traversal Surface binding '${prototypeId}.${bindingId}' is invalid.`,
    );
  }
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    logicalSubshapeId: record.logicalSubshapeId,
    traversalSurfaceProfileRef: record.traversalSurfaceProfileRef,
  });
}

function compileStaticColliderTraversalSurfaceV1(input: {
  readonly prototypeId: string;
  readonly prototypeVersion: number;
  readonly binding: PrototypeTraversalSurfaceBindingV1;
  readonly entityId: string;
  readonly staticColliders: readonly ExecutionStaticColliderV1[];
  readonly resourceLock: NormalizedWorldIRV4["resources"]["resourceLock"];
}): ExecutionStaticColliderTraversalSurfaceV1 {
  const matchingColliders = input.staticColliders.filter(
    (collider) =>
      collider.entityId === input.entityId &&
      collider.logicalSubshapeId === input.binding.logicalSubshapeId,
  );
  if (matchingColliders.length !== 1) {
    throw new Error(
      `Traversal Surface Collider join for '${input.entityId}.${input.binding.id}' requires exactly one Collider; received ${matchingColliders.length}.`,
    );
  }
  const collider = matchingColliders[0]!;
  if (
    collider.colliderSubshapeId !== deriveColliderSubshapeIdV1(
      input.entityId,
      input.binding.logicalSubshapeId,
    )
  ) {
    throw new Error(
      `Traversal Surface Collider join for '${input.entityId}.${input.binding.id}' has a non-canonical colliderSubshapeId.`,
    );
  }
  const resolvedProfile = resolveTraversalSurfaceProfileV1(
    input.binding.traversalSurfaceProfileRef,
  );
  const matchingProfileRows = input.resourceLock.filter(
    (row) => row.resourceRef === resolvedProfile.resourceRef,
  );
  if (matchingProfileRows.length !== 1) {
    throw new Error(
      `Traversal Surface Profile lock join for '${resolvedProfile.resourceRef}' requires exactly one row; received ${matchingProfileRows.length}.`,
    );
  }
  const profileRow = matchingProfileRows[0]!;
  if (
    profileRow.resourceRef !== resolvedProfile.resourceRef ||
    profileRow.resourceKind !== "traversal-surface-profile" ||
    profileRow.resolvedVersion !== resolvedProfile.resolvedVersion ||
    profileRow.contentHash !== resolvedProfile.contentHash
  ) {
    throw new Error(
      `Traversal Surface Profile lock join for '${resolvedProfile.resourceRef}' does not match the resolved receipt.`,
    );
  }

  const traversalSurfaceProfileRef = profileRow.resourceRef;
  const traversalSurfaceProfileResolvedVersion = profileRow.resolvedVersion;
  const traversalSurfaceProfileHash = profileRow.contentHash as `sha256:${string}`;
  const bindingIdentity = {
    id: input.binding.id,
    kind: input.binding.kind,
    logicalSubshapeId: input.binding.logicalSubshapeId,
    traversalSurfaceProfileRef: input.binding.traversalSurfaceProfileRef,
  };
  const traversalSurfaceId = `traversal-surface:${sha256CanonicalJson({
    kind: "static-collider",
    surfaceEntityId: input.entityId,
    logicalSurfaceId: input.binding.id,
  })}`;
  const resourceHash = sha256CanonicalJson({
    prototypeId: input.prototypeId,
    prototypeVersion: input.prototypeVersion,
    binding: bindingIdentity,
    traversalSurfaceProfileRef,
    traversalSurfaceProfileResolvedVersion,
    traversalSurfaceProfileHash,
    colliderHash: collider.colliderHash,
  }) as `sha256:${string}`;
  return {
    kind: "static-collider",
    traversalSurfaceId,
    surfaceEntityId: collider.entityId,
    colliderSubshapeId: collider.colliderSubshapeId,
    resourceRef:
      `package://traversal-surface/${input.entityId}.${input.binding.id}@${input.prototypeVersion}`,
    resolvedVersion: String(input.prototypeVersion),
    resourceHash,
    logicalSurfaceId: input.binding.id,
    logicalSubshapeId: collider.logicalSubshapeId,
    colliderHash: collider.colliderHash,
    traversalSurfaceProfileRef,
    traversalSurfaceProfileResolvedVersion,
    traversalSurfaceProfileHash,
  };
}

function compileStaticColliderTraversalSurfacesV1(
  world: NormalizedWorldIRV4,
  staticColliders: readonly ExecutionStaticColliderV1[],
  resourceLock: NormalizedWorldIRV4["resources"]["resourceLock"],
): readonly ExecutionStaticColliderTraversalSurfaceV1[] {
  const objectNodes = world.nodes.filter((node) => node.kind === "object");
  const surfaces: ExecutionStaticColliderTraversalSurfaceV1[] = [];
  for (const prototype of world.resources.prototypes) {
    const bindings = (prototype.traversalSurfaceBindings ?? []).map((binding) =>
      canonicalPrototypeTraversalSurfaceBindingV1(binding, prototype.id));
    const seenBindingIds = new Set<string>();
    const seenLogicalSubshapeIds = new Set<string>();
    for (const binding of bindings) {
      if (
        seenBindingIds.has(binding.id) ||
        seenLogicalSubshapeIds.has(binding.logicalSubshapeId)
      ) {
        throw new Error(
          `Traversal Surface binding '${prototype.id}.${binding.id}' is duplicated.`,
        );
      }
      seenBindingIds.add(binding.id);
      seenLogicalSubshapeIds.add(binding.logicalSubshapeId);
    }
    const prototypeRef =
      `package://prototype/${prototype.id}@${prototype.version}`;
    for (const node of objectNodes) {
      if (node.prototypeRef !== prototypeRef) continue;
      for (const binding of bindings) {
        surfaces.push(compileStaticColliderTraversalSurfaceV1({
          prototypeId: prototype.id,
          prototypeVersion: prototype.version,
          binding,
          entityId: node.id,
          staticColliders,
          resourceLock,
        }));
      }
    }
  }
  return surfaces;
}

function requireUniquePrototypeIdentitiesV1(
  prototypes: NormalizedWorldIRV4["resources"]["prototypes"],
): void {
  const seenPrototypeIdentities = new Set<string>();
  for (const prototype of prototypes) {
    const prototypeIdentity = `${prototype.id}@${prototype.version}`;
    if (seenPrototypeIdentities.has(prototypeIdentity)) {
      throw new Error(`Prototype identity '${prototypeIdentity}' is duplicated.`);
    }
    seenPrototypeIdentities.add(prototypeIdentity);
  }
}

function requireUniqueNodeEntityIdsV1(
  nodes: NormalizedWorldIRV4["nodes"],
): void {
  const seenEntityIds = new Set<string>();
  for (const node of nodes) {
    if (seenEntityIds.has(node.id)) {
      throw new Error(`Node entity id '${node.id}' is duplicated.`);
    }
    seenEntityIds.add(node.id);
  }
}

function compileConnectivityRequirementV1(
  requirement: NormalizedWorldIRV4["layout"]["connectivityRequirements"][number],
): ExecutionConnectivityRequirementV1 {
  return structuredClone(requirement);
}

export function compileWorldV5(input: CompileWorldInputV5): CompileWorldResultV5 {
  let snapshot: CompileWorldInputV5;
  try {
    snapshot = snapshotCompileWorldInputV5(input);
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: cause instanceof CompilerInputAccessorErrorV1
          ? "COMPILER_INPUT_ACCESSOR_FORBIDDEN"
          : "COMPILER_INPUT_INVALID",
        instancePath: "/normalizedWorldIr",
        message: cause instanceof CompilerInputAccessorErrorV1
          ? "Compiler input must be an accessor-free data graph."
          : "Compiler input must be a cloneable data graph.",
      }],
    };
  }
  const actualNormalizedWorldIrHash = sha256CanonicalJson(
    snapshot.normalizedWorldIr,
  );
  if (snapshot.normalizedWorldIrHash !== actualNormalizedWorldIrHash) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_HASH_MISMATCH",
        instancePath: "/normalizedWorldIrHash",
        message: "The supplied normalizedWorldIrHash does not match NormalizedWorldIRV4.",
        details: {
          expected: actualNormalizedWorldIrHash,
          actual: snapshot.normalizedWorldIrHash,
        },
      }],
    };
  }

  try {
    const normalizedResourceLockEntries = canonicalExecutionResourceLockEntriesV1(
      snapshot.normalizedWorldIr.resources.resourceLock,
    ) as NormalizedWorldIRV4["resources"]["resourceLock"];
    const normalizedResourceLockHash = sha256CanonicalJson(
      normalizedResourceLockEntries,
    );
    if (
      snapshot.normalizedWorldIr.resources.resourceLockHash !==
      normalizedResourceLockHash
    ) {
      throw new Error("Resource Lock hash does not match canonical entries.");
    }
    let gameplayBootstrapResourceLock: GameplayBootstrapExecutionResourceLockV1;
    try {
      const [canonicalBootstrap] = canonicalExecutionResourceLockEntriesV1([
        snapshot.gameplayBootstrapResourceLock,
      ]);
      if (
        isNil(canonicalBootstrap) ||
        canonicalBootstrap.resourceKind !== "gameplay-bootstrap" ||
        normalizedResourceLockEntries.some(
          (entry) => entry.resourceRef === canonicalBootstrap.resourceRef,
        )
      ) {
        throw new TypeError("Invalid Gameplay Bootstrap Resource Lock.");
      }
      gameplayBootstrapResourceLock = canonicalBootstrap as
        GameplayBootstrapExecutionResourceLockV1;
    } catch {
      return {
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "COMPILER_GAMEPLAY_BOOTSTRAP_LOCK_INVALID",
          instancePath: "/gameplayBootstrapResourceLock",
          message: "The Gameplay Bootstrap Resource Lock must be one unique gameplay-bootstrap row.",
        }],
      };
    }
    const resourceLockEntries = canonicalExecutionResourceLockEntriesV1([
      ...normalizedResourceLockEntries,
      gameplayBootstrapResourceLock,
    ]);
    const resourceLockHash = sha256CanonicalJson(resourceLockEntries);
    requireUniquePrototypeIdentitiesV1(
      snapshot.normalizedWorldIr.resources.prototypes,
    );
    requireUniqueNodeEntityIdsV1(snapshot.normalizedWorldIr.nodes);
    const compiledCurrent = compileWorldCore({
      normalizedWorldIr: snapshot.normalizedWorldIr,
    });
    if (!compiledCurrent.ok || compiledCurrent.components === undefined) {
      return { ok: false, diagnostics: compiledCurrent.diagnostics };
    }

    const terrain = compileLockedTerrainV4(
      snapshot.normalizedWorldIr,
      compiledCurrent.components.terrain,
    );
    const staticColliders = compiledCurrent.components.objects
      .filter((object) => object.collisionEnabled)
      .map(compileStaticColliderV1)
      .sort((left, right) =>
        left.colliderSubshapeId.localeCompare(right.colliderSubshapeId));
    const sortedTraversalSurfaces = [
      compileHeightfieldTraversalSurfaceV1(terrain),
      ...compileStaticColliderTraversalSurfacesV1(
        snapshot.normalizedWorldIr,
        staticColliders,
        normalizedResourceLockEntries,
      ),
    ].sort((left, right) =>
      left.traversalSurfaceId.localeCompare(right.traversalSurfaceId));
    for (let index = 1; index < sortedTraversalSurfaces.length; index += 1) {
      const previous = sortedTraversalSurfaces[index - 1]!;
      const current = sortedTraversalSurfaces[index]!;
      if (current.traversalSurfaceId === previous.traversalSurfaceId) {
        throw new Error(
          `Traversal Surface id '${current.traversalSurfaceId}' is duplicated.`,
        );
      }
    }
    const traversalSurfaces = Object.freeze(
      sortedTraversalSurfaces.map((surface) => Object.freeze(surface)),
    );
    const {
      controlledEntityId: initialControlledEntityId,
      ...componentsWithoutControlledEntity
    } = compiledCurrent.components;
    const plan = parseExecutionPlanV5({
      kind: "worldkit-execution-plan",
      ...componentsWithoutControlledEntity,
      schemaVersion: 5,
      initialControlledEntityId,
      initialRelationships: snapshot.normalizedWorldIr.relationships
        .map((relationship) => ({
          ...structuredClone(relationship),
          establishedSimulationTick: 0,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      authoringSpecHash: snapshot.normalizedWorldIr.authoringSpecHash,
      normalizedWorldIrHash: snapshot.normalizedWorldIrHash,
      resourceLockHash,
      resourceLockEntries,
      actionPresentationRegistry: {
        schemaVersion: 1,
        bindings: [],
        rootMotionSources: [],
      },
      terrain,
      layout: compileExecutionLayoutV1(snapshot.normalizedWorldIr),
      traversal: {
        surfaces: traversalSurfaces,
        traversalAreas: snapshot.normalizedWorldIr.layout.traversalAreas
          .map(compileTraversalAreaV1)
          .sort((left, right) => left.id.localeCompare(right.id)),
        connectivityRequirements: snapshot.normalizedWorldIr.layout
          .connectivityRequirements
          .map(compileConnectivityRequirementV1)
          .sort((left, right) => left.constraintId.localeCompare(right.constraintId)),
        anchorEntityIds: snapshot.normalizedWorldIr.nodes
          .filter((node) => node.kind === "anchor")
          .map((node) => node.id)
          .sort((left, right) => left.localeCompare(right)),
      },
      staticColliders,
    });
    return {
      ok: true,
      executionPlan: plan,
      executionPlanHash: hashExecutionPlanV5(plan),
      diagnostics: [],
    };
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message: cause instanceof Error
          ? cause.message
          : "NormalizedWorldIRV4 could not be compiled.",
      }],
    };
  }
}
