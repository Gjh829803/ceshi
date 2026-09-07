import type {
  NormalizedAnimationSetV1,
  NormalizedColliderProfileV1,
  NormalizedRigProfileV1,
  NormalizedSubjectAssetV1,
  NormalizedSubjectDefinitionV2,
  NormalizedSubjectSocketV2,
  NormalizedSubjectVisualPartV2,
  NormalizedWorldIRV4,
  NormalizedWorldNodeV4,
} from "@whitebox-world/authoring";
import type { Sha256HashV1 } from "@whitebox-world/protocol";
import { BIPED_BONE_IDS_V1 } from "@whitebox-world/subject-contracts";
import type {
  RuntimeAnimationSetV1,
  RuntimeColliderProfileV1,
  RuntimeRigProfileV1,
  RuntimeSubjectAssetV1,
  RuntimeSubjectDescriptorV1,
  RuntimeSubjectSocketV1,
  RuntimeSubjectVisualPartV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

/**
 * Subject-only projection of already admitted, normalized Authoring data.
 * Callers own input admission, resource-lock identity and unique entity IDs.
 * No world, terrain, Camera or Scene Source is created by this compiler.
 */
export interface NormalizedSubjectCompileInputV1 {
  readonly resources: Pick<NormalizedWorldIRV4["resources"],
    "subjectDefinitions" | "subjectAssets" | "rigProfiles" |
    "animationSets" | "colliderProfiles" | "resourceLock">;
  readonly nodes: readonly NormalizedSubjectCompileNodeV1[];
}

export type NormalizedSubjectCompileNodeV1 =
  | Pick<Extract<NormalizedWorldNodeV4, { kind: "anchor" }>, "id" | "kind" | "transform">
  | Pick<Extract<NormalizedWorldNodeV4, { kind: "subject" }>, "id" | "kind" | "subjectDefinitionRef" | "spawnAnchorEntityId">;

export interface CompiledSubjectV1 extends RuntimeSubjectDescriptorV1 {
  readonly spawnAnchorEntityId: string;
  readonly spawnSubjectOriginPositionMetersXYZ: readonly [number, number, number];
  readonly spawnSubjectFacingRadians: number;
}

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

export interface CompiledSubjectResourcesV1 {
  subjects: CompiledSubjectV1[];
  subjectAssets: RuntimeSubjectAssetV1[];
  rigProfiles: RuntimeRigProfileV1[];
  animationSets: RuntimeAnimationSetV1[];
  colliderProfiles: RuntimeColliderProfileV1[];
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
): RuntimeSubjectAssetV1 {
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
): RuntimeRigProfileV1 {
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
): RuntimeAnimationSetV1 {
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
): RuntimeColliderProfileV1 {
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
): RuntimeSubjectVisualPartV1 {
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

function compileSubjectSocketV3(socket: NormalizedSubjectSocketV2): RuntimeSubjectSocketV1 {
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
): NonNullable<CompiledSubjectV1["capabilityAssembly"]> {
  const compileMotionProfile = (
    profile: typeof assembly.defaultMotionProfile,
  ): NonNullable<CompiledSubjectV1["capabilityAssembly"]>["defaultMotionProfile"] => ({
    resourceRef: profile.resourceRef,
    contentHash: profile.contentHash,
    motionKernelRef: profile.motionKernelRef,
    motionTags: [...profile.motionTags],
  });
  const compileMotionKernel = (
    motionKernel: typeof assembly.motionKernels[number],
  ): NonNullable<CompiledSubjectV1["capabilityAssembly"]>["motionKernels"][number] => {
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
  definitionCollider: CompiledSubjectV1["collider"],
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

export function compileNormalizedSubjectResourcesV1(
  world: NormalizedSubjectCompileInputV1,
): CompiledSubjectResourcesV1 {
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
        (node): node is Extract<NormalizedSubjectCompileNodeV1, { kind: "anchor" }> =>
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
      (node): node is Extract<NormalizedSubjectCompileNodeV1, { kind: "subject" }> =>
        node.kind === "subject",
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node): CompiledSubjectV1 => {
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
        subjectDefinitionHash:
          definition.subjectDefinitionHash as Sha256HashV1,
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
        locomotionCapabilityHash:
          locomotionCapabilityLock.contentHash as Sha256HashV1,
        physicsBodyProfileRef: definition.profiles.physicsBodyProfileRef,
        locomotionProfileRef: definition.profiles.locomotionProfileRef,
        controlFeel: {
          resourceRef: definition.controlFeel.resourceRef,
          contentHash: definition.controlFeel.contentHash,
          jumpVariantPolicy: structuredClone(definition.controlFeel.jumpVariantPolicy),
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
          jumpVariantPolicy: structuredClone(feel.jumpVariantPolicy),
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
