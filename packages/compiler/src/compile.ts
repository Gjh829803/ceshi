import type {
  NormalizedAnimationSetV1,
  NormalizedColliderProfileV1,
  NormalizedRigProfileV1,
  NormalizedSubjectAssetV1,
  NormalizedSubjectDefinitionV2,
  NormalizedWorldIRV3,
  NormalizedLayoutAssertionV1,
  NormalizedWorldNodeV3,
  NormalizedSubjectSocketV2,
  NormalizedSubjectVisualPartV2,
  PrimitivePrototypeSpecV2,
  Vec2,
} from "@whitebox-world/authoring";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { sampleTriangleHeightfieldSurface } from "@whitebox-world/terrain-surface";
import type {
  CompileDiagnostic,
  CompileWorldResultV4,
  ExecutionAnimationSetV1,
  ExecutionBipedBoneIdV1,
  ExecutionColliderProfileV1,
  ExecutionObjectPrimitiveV3,
  ExecutionObjectV3,
  ExecutionPlanV4,
  ExecutionLayoutAssertionV1,
  ExecutionLayoutPlacementV1,
  ExecutionRigProfileV1,
  ExecutionSubjectAssetV1,
  ExecutionSubjectV3,
  ExecutionTerrainV3,
  ExecutionWaterBoundaryV3,
  ExecutionWaterV3,
  SubjectSocketV3,
  SubjectVisualPartV3,
} from "@whitebox-world/runtime-contracts";

import { sampleFractalNoise } from "./noise";

const EXECUTION_BIPED_BONE_IDS = [
  "chest",
  "foot.left",
  "foot.right",
  "hand.left",
  "hand.right",
  "head",
  "hips",
  "lower-arm.left",
  "lower-arm.right",
  "lower-leg.left",
  "lower-leg.right",
  "neck",
  "spine",
  "upper-arm.left",
  "upper-arm.right",
  "upper-leg.left",
  "upper-leg.right",
] as const satisfies readonly ExecutionBipedBoneIdV1[];

interface CompileWorldCoreInput {
  normalizedWorldIr: NormalizedWorldIRV3;
  normalizedWorldIrHash: string;
}

type ExecutionPlanCompilerCore =
  Omit<ExecutionPlanV4, "schemaVersion" | "camera" | "layout"> & {
    readonly schemaVersion: 3;
    readonly camera: Omit<ExecutionPlanV4["camera"], "aspectRatio">;
  };

interface CompileWorldCoreResult {
  readonly ok: boolean;
  readonly executionPlan?: ExecutionPlanCompilerCore;
  readonly executionPlanHash?: string;
  readonly diagnostics: readonly CompileDiagnostic[];
}

export interface CompileWorldInputV4 {
  readonly normalizedWorldIr: NormalizedWorldIRV3;
  readonly normalizedWorldIrHash: string;
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

function findOnlyNodeV3<K extends NormalizedWorldNodeV3["kind"]>(
  nodes: readonly NormalizedWorldNodeV3[],
  kind: K,
): Extract<NormalizedWorldNodeV3, { kind: K }> {
  const node = nodes.find(
    (candidate): candidate is Extract<NormalizedWorldNodeV3, { kind: K }> =>
      candidate.kind === kind,
  );
  if (node === undefined) {
    throw new Error(`NormalizedWorldIRV3 invariant violated: missing '${kind}' node.`);
  }
  return node;
}

function compileTerrainV3(world: NormalizedWorldIRV3): ExecutionTerrainV3 {
  const node = findOnlyNodeV3(world.nodes, "terrain");
  const terrain = node.components.terrain;
  const source = terrain.source;
  const [columns, rows] = terrain.grid.resolutionCellsXZ;
  const [centerX, centerZ] = terrain.grid.centerMetersXZ;
  const [sizeX, sizeZ] = terrain.grid.sizeMetersXZ;
  const minimumX = centerX - sizeX / 2;
  const minimumZ = centerZ - sizeZ / 2;
  const heights: number[] = [];
  let minimumHeightMeters = Number.POSITIVE_INFINITY;
  let maximumHeightMeters = Number.NEGATIVE_INFINITY;

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
      const height = source.baseHeightMeters + noise * source.amplitudeMeters;
      heights.push(height);
      minimumHeightMeters = Math.min(minimumHeightMeters, height);
      maximumHeightMeters = Math.max(maximumHeightMeters, height);
    }
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
  world: NormalizedWorldIRV3,
  terrain: ExecutionTerrainV3,
): ExecutionWaterV3[] {
  return world.nodes
    .filter(
      (node): node is Extract<NormalizedWorldNodeV3, { kind: "water" }> =>
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

function compileObjectsV3(world: NormalizedWorldIRV3): ExecutionObjectV3[] {
  const prototypes = new Map(
    world.resources.prototypes.map((prototype) => [
      `${prototype.id}@${prototype.version}`,
      prototype,
    ]),
  );
  return world.nodes
    .filter(
      (node): node is Extract<NormalizedWorldNodeV3, { kind: "object" }> =>
        node.kind === "object",
    )
    .map((node) => {
      const prototypeIdentity = node.prototypeRef.slice(
        "package://prototype/".length,
      );
      const prototype = prototypes.get(prototypeIdentity);
      if (prototype === undefined) {
        throw new Error(
          `NormalizedWorldIRV3 invariant violated: missing Prototype '${prototypeIdentity}'.`,
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
        `NormalizedWorldIRV3 invariant violated: duplicate ${label} '${ref}'.`,
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
      `NormalizedWorldIRV3 invariant violated: missing ${label} '${resourceRef}'.`,
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
  for (const boneId of EXECUTION_BIPED_BONE_IDS) {
    const hasMapping = Object.prototype.hasOwnProperty.call(
      resource.sourceNodeNameByBoneId,
      boneId,
    );
    const sourceNodeName = resource.sourceNodeNameByBoneId[boneId];
    if (!hasMapping || typeof sourceNodeName !== "string") {
      throw new Error(
        `NormalizedWorldIRV3 invariant violated: Rig Profile '${resource.rigProfileRef}' is missing source-node mapping for Bone '${boneId}'.`,
      );
    }
    if (sourceNodeName.trim().length === 0) {
      throw new Error(
        `NormalizedWorldIRV3 invariant violated: Rig Profile '${resource.rigProfileRef}' has an empty source-node mapping for Bone '${boneId}'.`,
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
    motionKernelRef: profile.motionKernelRef,
    parameters: structuredClone(profile.parameters),
    safetyLimits: structuredClone(profile.safetyLimits),
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
        `NormalizedWorldIRV3 invariant violated: reserved Motion Kernel '${motionKernel.resourceRef}' cannot enter an Execution Plan.`,
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
    if (profile.relationshipType === "mount") {
      throw new Error(
        `NormalizedWorldIRV3 invariant violated: reserved Mount Profile '${profile.resourceRef}' cannot enter an Execution Plan.`,
      );
    }
    return {
      resourceRef: profile.resourceRef,
      relationshipType: profile.relationshipType,
      requiredSourceSocketIds: [...profile.requiredSourceSocketIds],
      requiredTargetSocketIds: [...profile.requiredTargetSocketIds],
      controlTransferPolicy: profile.controlTransferPolicy,
      cameraTargetPolicy: profile.cameraTargetPolicy,
      ...(profile.maximumDistanceMeters === undefined
        ? {}
        : { maximumDistanceMeters: profile.maximumDistanceMeters }),
    };
  });
  return {
    authoringAvailability: assembly.authoringAvailability,
    defaultMotionProfile: compileMotionProfile(assembly.defaultMotionProfile),
    optionalMotionProfiles: assembly.optionalMotionProfiles.map(compileMotionProfile),
    fallbackMotionProfile: compileMotionProfile(assembly.fallbackMotionProfile),
    motionKernels: assembly.motionKernels.map(compileMotionKernel),
    controlProfile: {
      resourceRef: assembly.controlProfile.resourceRef,
      commandKind: assembly.controlProfile.commandKind,
      inputSpace: assembly.controlProfile.inputSpace,
      facingPolicy: assembly.controlProfile.facingPolicy,
      lateralMovementPolicy: assembly.controlProfile.lateralMovementPolicy,
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
        algorithmRef: profile.algorithmRef,
        preferredSocketIds: [...profile.preferredSocketIds],
        parameters: structuredClone(profile.parameters),
      })),
    },
    mediumProfile: {
      resourceRef: assembly.mediumProfile.resourceRef,
      supportedMediums: [...assembly.mediumProfile.supportedMediums],
      ground: structuredClone(assembly.mediumProfile.ground),
      ...(assembly.mediumProfile.water === undefined
        ? {}
        : { water: structuredClone(assembly.mediumProfile.water) }),
      ...(assembly.mediumProfile.air === undefined
        ? {}
        : { air: structuredClone(assembly.mediumProfile.air) }),
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
  world: NormalizedWorldIRV3,
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
        (node): node is Extract<NormalizedWorldNodeV3, { kind: "anchor" }> =>
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
      (node): node is Extract<NormalizedWorldNodeV3, { kind: "subject" }> =>
        node.kind === "subject",
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node): ExecutionSubjectV3 => {
      const definition = definitionsByRef.get(node.subjectDefinitionRef);
      if (definition === undefined) {
        throw new Error(
          `NormalizedWorldIRV3 invariant violated: Subject '${node.id}' references missing Definition '${node.subjectDefinitionRef}'.`,
        );
      }
      const spawnAnchor = anchorsByEntityId.get(node.spawnAnchorEntityId);
      if (spawnAnchor === undefined) {
        throw new Error(
          `NormalizedWorldIRV3 invariant violated: Subject '${node.id}' references missing Spawn Anchor '${node.spawnAnchorEntityId}'.`,
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
        reachableSubjectAssetsByRef.set(subjectAsset.subjectAssetRef, subjectAsset);
      }

      if (definition.visualBinding.mode === "rigged") {
        if (assetParts.length !== 1) {
          throw new Error(
            `NormalizedWorldIRV3 invariant violated: rigged Subject '${node.id}' must select exactly one Subject Asset.`,
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
            `NormalizedWorldIRV3 invariant violated: Rig Profile '${rigProfile.rigProfileRef}' has topology '${rigProfile.bodyTopology}', but Subject '${node.id}' has '${definition.bodyTopology}'.`,
          );
        }
        if (animationSet.subjectAssetRef !== subjectAssetRef) {
          throw new Error(
            `NormalizedWorldIRV3 invariant violated: Animation Set '${animationSet.animationSetRef}' targets Subject Asset '${animationSet.subjectAssetRef}', but Subject '${node.id}' selects '${subjectAssetRef}'.`,
          );
        }
        if (animationSet.rigProfileRef !== rigProfile.rigProfileRef) {
          throw new Error(
            `NormalizedWorldIRV3 invariant violated: Animation Set '${animationSet.animationSetRef}' targets Rig Profile '${animationSet.rigProfileRef}', but Subject '${node.id}' selects '${rigProfile.rigProfileRef}'.`,
          );
        }
        const requiredBoneIds = new Set(rigProfile.requiredBoneIds);
        const missingSocketBone = definition.sockets.find(
          (socket) => socket.kind === "bone" && !requiredBoneIds.has(socket.boneId),
        );
        if (missingSocketBone?.kind === "bone") {
          throw new Error(
            `NormalizedWorldIRV3 invariant violated: Bone Socket '${missingSocketBone.id}' targets undeclared Bone '${missingSocketBone.boneId}'.`,
          );
        }
        reachableRigProfilesByRef.set(rigProfile.rigProfileRef, rigProfile);
        reachableAnimationSetsByRef.set(animationSet.animationSetRef, animationSet);
      } else if (
        assetParts.length > 0 ||
        definition.sockets.some((socket) => socket.kind === "bone")
      ) {
        throw new Error(
          `NormalizedWorldIRV3 invariant violated: static Subject '${node.id}' contains rigged visual data.`,
        );
      }

      if (definition.colliderPolicy.kind === "profile") {
        const colliderProfile = requireNormalizedResourceRowV3(
          colliderProfilesByRef,
          definition.colliderPolicy.colliderProfileRef,
          "Collider Profile",
        );
        if (!colliderProfile.supportedBodyTopologies.includes(definition.bodyTopology)) {
          throw new Error(
            `NormalizedWorldIRV3 invariant violated: Collider Profile '${colliderProfile.colliderProfileRef}' does not support Subject '${node.id}' topology '${definition.bodyTopology}'.`,
          );
        }
        if (!colliderProfileMatchesDefinitionV3(colliderProfile, definition.collider)) {
          throw new Error(
            `NormalizedWorldIRV3 invariant violated: Collider Profile '${colliderProfile.colliderProfileRef}' does not match Subject '${node.id}' collider.`,
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
          mode: definition.locomotion.mode,
          walkSpeedMetersPerSecond:
            definition.locomotion.walkSpeedMetersPerSecond,
          runSpeedMetersPerSecond:
            definition.locomotion.runSpeedMetersPerSecond,
          waterSpeedMetersPerSecond:
            definition.locomotion.waterSpeedMetersPerSecond,
          jumpSpeedMetersPerSecond:
            definition.locomotion.jumpSpeedMetersPerSecond,
        },
        ...(definition.capabilityAssembly === undefined
          ? {}
          : {
              capabilityAssembly: compileCapabilityAssemblyV1(
                definition.capabilityAssembly,
              ),
            }),
      };
    })
    .sort((left, right) => left.entityId.localeCompare(right.entityId));

  if (subjects.length === 0) {
    throw new Error(
      "NormalizedWorldIRV3 invariant violated: no Subject nodes were materialized.",
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
  const actualNormalizedWorldIrHash = sha256CanonicalJson(world);
  if (input.normalizedWorldIrHash !== actualNormalizedWorldIrHash) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "COMPILER_NORMALIZED_HASH_MISMATCH",
          instancePath: "/normalizedWorldIrHash",
          message:
            "The supplied normalizedWorldIrHash does not match NormalizedWorldIRV3.",
          details: {
            expected: actualNormalizedWorldIrHash,
            actual: input.normalizedWorldIrHash,
          },
        },
      ],
    };
  }

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
    const cameraNode = findOnlyNodeV3(world.nodes, "camera");
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
    const executionPlan: ExecutionPlanCompilerCore = {
      kind: "worldkit-execution-plan",
      schemaVersion: 3,
      id: world.id,
      seed: world.seed,
      runtimeBackend: "babylon-havok",
      normalizedWorldIrHash: input.normalizedWorldIrHash,
      resourceLockHash: world.resources.resourceLockHash,
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
        manualSwitchAllowed: rig.manualSwitchAllowed,
      },
      resourceUsage: usage,
    };
    return {
      ok: true,
      executionPlan,
      executionPlanHash: sha256CanonicalJson(executionPlan),
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
              : "NormalizedWorldIRV3 could not be compiled.",
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
  node: Extract<NormalizedWorldIRV3["nodes"][number], { kind: "object" | "anchor" }>,
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

function compileLockedTerrainV4(
  world: NormalizedWorldIRV3,
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
  return {
    entityId: baseline.entityId,
    centerMetersXZ: [...heightfield.centerMetersXZ],
    sizeMetersXZ: [...heightfield.sizeMetersXZ],
    resolutionCellsXZ: [...heightfield.resolutionVerticesXZ],
    heightSamplesMeters,
    heightSamplesHash,
    minimumHeightMeters: Math.min(...heightSamplesMeters),
    maximumHeightMeters: Math.max(...heightSamplesMeters),
    semanticClassId: baseline.semanticClassId,
  };
}

export function compileWorldV4(input: CompileWorldInputV4): CompileWorldResultV4 {
  const actualNormalizedWorldIrHash = sha256CanonicalJson(input.normalizedWorldIr);
  if (input.normalizedWorldIrHash !== actualNormalizedWorldIrHash) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_HASH_MISMATCH",
        instancePath: "/normalizedWorldIrHash",
        message: "The supplied normalizedWorldIrHash does not match NormalizedWorldIRV3.",
        details: { expected: actualNormalizedWorldIrHash, actual: input.normalizedWorldIrHash },
      }],
    };
  }
  try {
    const world = input.normalizedWorldIr;
    const baseline = compileWorldCore({
      normalizedWorldIr: world,
      normalizedWorldIrHash: input.normalizedWorldIrHash,
    });
    if (!baseline.ok || baseline.executionPlan === undefined) {
      return { ok: false, diagnostics: baseline.diagnostics };
    }
    const cameraNode = world.nodes.find((node) => node.kind === "camera");
    if (cameraNode?.kind !== "camera") throw new Error("COMPILER_LAYOUT_CAMERA_MISSING");
    const placements = world.nodes
      .filter((node): node is Extract<typeof node, { kind: "object" | "anchor" }> => node.kind === "object" || node.kind === "anchor")
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const node of placements) {
      if (
        node.placementProvenance.layoutSolveReportHash !== world.layout.layoutSolveReportHash ||
        node.placementProvenance.solverProfileRef !== world.layout.solverProfileRef
      ) throw new Error("COMPILER_LAYOUT_PROVENANCE_MISMATCH");
    }
    const plan: ExecutionPlanV4 = {
      ...baseline.executionPlan,
      schemaVersion: 4,
      normalizedWorldIrHash: input.normalizedWorldIrHash,
      terrain: compileLockedTerrainV4(world, baseline.executionPlan.terrain),
      camera: {
        ...baseline.executionPlan.camera,
        aspectRatio: cameraNode.components.cameraRig.thirdPerson.aspectRatio,
      },
      layout: {
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
            ...(region.minimumHeightMeters === undefined ? {} : { minimumHeightMeters: region.minimumHeightMeters }),
            ...(region.maximumHeightMeters === undefined ? {} : { maximumHeightMeters: region.maximumHeightMeters }),
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
      },
    };
    return {
      ok: true,
      executionPlan: plan,
      executionPlanHash: sha256CanonicalJson(plan),
      diagnostics: [],
    };
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message: cause instanceof Error ? cause.message : "NormalizedWorldIRV3 could not be compiled.",
      }],
    };
  }
}

export const compileWorld = compileWorldV4;
