import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import type { Bone } from "@babylonjs/core/Bones/bone.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  ExecutionPlanV5,
  ExecutionRigProfileV1,
  ExecutionSubjectAssetV1,
  ExecutionSubjectV3,
  SubjectVisualPrimitivePartV3,
} from "@whitebox-world/runtime-contracts";
import type { GroundHumanoidActionIdV1 } from "@whitebox-world/subject-contracts";

import { SubjectAnimationPlayer } from "./subject-animation-player";
import {
  SubjectAssetRuntimeErrorV1,
  type SubjectAssetCacheV1,
  type SubjectAssetInstanceV1,
  type SubjectAssetLeaseV1,
  type SubjectAssetRuntimeErrorCodeV1,
} from "./subject-asset-cache";

export interface SubjectVisual {
  root: TransformNode;
  meshes: readonly AbstractMesh[];
  socketNodesById: ReadonlyMap<string, TransformNode>;
  readonly activeActionId: GroundHumanoidActionIdV1;
  stepAnimation(tick: number, actionId: GroundHumanoidActionIdV1): void;
  applyAnimationPose(): void;
  resetAnimation(): void;
  dispose(): void;
}

export interface CreateSubjectVisualOptionsV1 {
  subject: ExecutionSubjectV3;
  executionPlan: ExecutionPlanV5;
  material: Material;
  scene: Scene;
  subjectAssetCache: SubjectAssetCacheV1;
}

function createPartMesh(
  subjectEntityId: string,
  part: SubjectVisualPrimitivePartV3,
  scene: Scene,
): Mesh {
  const name = `${subjectEntityId}.${part.id}`;
  switch (part.shape.kind) {
    case "capsule":
      return MeshBuilder.CreateCapsule(
        name,
        {
          height: part.shape.heightMeters,
          radius: part.shape.radiusMeters,
          tessellation: 16,
        },
        scene,
      );
    case "box":
      return MeshBuilder.CreateBox(
        name,
        {
          width: part.shape.sizeMetersXYZ[0],
          height: part.shape.sizeMetersXYZ[1],
          depth: part.shape.sizeMetersXYZ[2],
        },
        scene,
      );
    case "sphere":
      return MeshBuilder.CreateSphere(
        name,
        { diameter: part.shape.radiusMeters * 2, segments: 16 },
        scene,
      );
    case "cylinder":
      return MeshBuilder.CreateCylinder(
        name,
        {
          height: part.shape.heightMeters,
          diameter: part.shape.radiusMeters * 2,
          tessellation: 16,
        },
        scene,
      );
  }
}

function applyLocalTransform(
  node: TransformNode,
  transform: {
    positionMetersXYZ: readonly [number, number, number];
    rotationEulerRadiansXYZ: readonly [number, number, number];
  },
): void {
  node.position = new Vector3(...transform.positionMetersXYZ);
  node.rotationQuaternion = Quaternion.FromEulerAngles(
    ...transform.rotationEulerRadiansXYZ,
  );
}

function assetError(
  code: SubjectAssetRuntimeErrorCodeV1,
  asset?: ExecutionSubjectAssetV1,
): SubjectAssetRuntimeErrorV1 {
  return new SubjectAssetRuntimeErrorV1(
    code,
    asset === undefined
      ? undefined
      : {
          subjectAssetRef: asset.subjectAssetRef,
          artifactContentHash: asset.artifactContentHash,
        },
  );
}

function exactResource<T>(
  resources: readonly T[],
  ref: string,
  getRef: (resource: T) => string,
  code: SubjectAssetRuntimeErrorCodeV1,
  asset?: ExecutionSubjectAssetV1,
): T {
  const matches = resources.filter((resource) => getRef(resource) === ref);
  if (matches.length !== 1) throw assetError(code, asset);
  return matches[0]!;
}

interface ValidatedRigV1 {
  mappedBones: ReadonlyMap<string, Bone>;
  skeletonRootBone: Bone;
}

function validateRig(
  instance: SubjectAssetInstanceV1,
  rigProfile: ExecutionRigProfileV1,
  asset: ExecutionSubjectAssetV1,
): ValidatedRigV1 {
  if (instance.skeletons.length !== 1) {
    throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE", asset);
  }
  const skeleton = instance.skeletons[0]!;
  const bonesBySourceName = new Map<string, Bone>();
  for (const bone of skeleton.bones) {
    if (bone.name.length === 0 || bonesBySourceName.has(bone.name)) {
      throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE", asset);
    }
    bonesBySourceName.set(bone.name, bone);
  }
  const rootBones = skeleton.bones.filter((bone) => bone.getParent() === null);
  if (
    rootBones.length !== 1 ||
    rootBones[0]!.name !== rigProfile.skeletonRootBoneName
  ) {
    throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE", asset);
  }
  const mappedBones = new Map<string, Bone>();
  const uniqueBones = new Set<Bone>();
  for (const boneId of rigProfile.requiredBoneIds) {
    const sourceName = rigProfile.sourceNodeNameByBoneId[boneId];
    const bone = bonesBySourceName.get(sourceName);
    if (bone === undefined || uniqueBones.has(bone)) {
      throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE", asset);
    }
    uniqueBones.add(bone);
    mappedBones.set(boneId, bone);
  }
  return { mappedBones, skeletonRootBone: rootBones[0]! };
}

function validateRootMotion(
  animationGroups: readonly AnimationGroup[],
  skeletonRootBone: Bone,
  mappedBones: ReadonlyMap<string, Bone>,
  asset: ExecutionSubjectAssetV1,
): void {
  const forbiddenTargets = new Set<unknown>();
  for (const bone of [skeletonRootBone, mappedBones.get("hips")]) {
    if (bone === undefined) continue;
    forbiddenTargets.add(bone);
    const transformNode = bone.getTransformNode();
    if (transformNode !== null) forbiddenTargets.add(transformNode);
  }
  for (const group of animationGroups) {
    for (const targeted of group.targetedAnimations) {
      if (
        forbiddenTargets.has(targeted.target) &&
        targeted.animation.targetProperty.startsWith("position")
      ) {
        throw assetError("SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED", asset);
      }
    }
  }
}

function isDescendantOfAnyRoot(
  mesh: AbstractMesh,
  roots: readonly TransformNode[],
): boolean {
  let current: TransformNode | null = mesh;
  while (current !== null) {
    if (roots.includes(current)) return true;
    current = current.parent instanceof TransformNode ? current.parent : null;
  }
  return false;
}

interface StaticAssetPartResetStateV1 {
  readonly node: TransformNode;
  readonly position: Vector3;
  readonly rotationQuaternion: Quaternion;
  readonly scaling: Vector3;
}

type CleanupAttemptV1 = (cleanup: () => void) => void;

function disposeSubjectSocketsAndPrimitives(
  socketNodesById: ReadonlyMap<string, TransformNode>,
  primitiveMeshes: readonly Mesh[],
  attempt: CleanupAttemptV1,
): void {
  for (const socket of [...socketNodesById.values()].reverse()) {
    attempt(() => socket.detachFromBone());
    attempt(() => socket.dispose(false, false));
  }
  for (const mesh of [...primitiveMeshes].reverse()) {
    attempt(() => mesh.dispose(false, false));
  }
}

function disposeSubjectAssetNodesAndMaterial(
  assetPartRoots: readonly TransformNode[],
  staticOwnedMaterial: Material | undefined,
  root: TransformNode,
  attempt: CleanupAttemptV1,
): void {
  for (const partRoot of [...assetPartRoots].reverse()) {
    attempt(() => partRoot.dispose(false, false));
  }
  attempt(() => staticOwnedMaterial?.dispose(false, false));
  attempt(() => root.dispose(false, false));
}

class OwnedSubjectVisual implements SubjectVisual {
  private disposed = false;
  private fallbackActionId: GroundHumanoidActionIdV1 = "idle";

  constructor(
    readonly root: TransformNode,
    readonly meshes: readonly AbstractMesh[],
    readonly socketNodesById: ReadonlyMap<string, TransformNode>,
    private readonly primitiveMeshes: readonly Mesh[],
    private readonly assetPartRoots: readonly TransformNode[],
    private readonly staticAssetPartResetStates:
      readonly StaticAssetPartResetStateV1[],
    private readonly staticOwnedMaterial: Material | undefined,
    private readonly animationPlayer: SubjectAnimationPlayer | undefined,
    private readonly assetDescriptor: ExecutionSubjectAssetV1 | undefined,
    private readonly assetInstance: SubjectAssetInstanceV1 | undefined,
    private readonly assetLease: SubjectAssetLeaseV1 | undefined,
  ) {}

  get activeActionId(): GroundHumanoidActionIdV1 {
    return this.animationPlayer?.activeActionId ?? this.fallbackActionId;
  }

  stepAnimation(tick: number, actionId: GroundHumanoidActionIdV1): void {
    this.fallbackActionId = actionId;
    this.animationPlayer?.step(tick, actionId);
  }

  applyAnimationPose(): void {
    this.animationPlayer?.applyPose();
  }

  resetAnimation(): void {
    this.fallbackActionId = "idle";
    for (const state of this.staticAssetPartResetStates) {
      state.node.position.copyFrom(state.position);
      state.node.rotation.setAll(0);
      state.node.rotationQuaternion = state.rotationQuaternion.clone();
      state.node.scaling.copyFrom(state.scaling);
    }
    this.animationPlayer?.reset();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    let firstFailure: unknown;
    const attempt = (dispose: () => void): void => {
      try {
        dispose();
      } catch (error) {
        firstFailure ??= error;
      }
    };
    if (this.staticOwnedMaterial !== undefined) {
      attempt(() => this.assetInstance?.dispose());
      attempt(() => this.assetLease?.release());
      disposeSubjectSocketsAndPrimitives(
        this.socketNodesById,
        this.primitiveMeshes,
        attempt,
      );
      disposeSubjectAssetNodesAndMaterial(
        this.assetPartRoots,
        this.staticOwnedMaterial,
        this.root,
        attempt,
      );
    } else {
      attempt(() => this.animationPlayer?.dispose());
      disposeSubjectSocketsAndPrimitives(
        this.socketNodesById,
        this.primitiveMeshes,
        attempt,
      );
      if (this.assetInstance !== undefined) {
        attempt(() => this.assetInstance!.dispose());
      }
      disposeSubjectAssetNodesAndMaterial(
        this.assetPartRoots,
        undefined,
        this.root,
        attempt,
      );
      if (this.assetLease !== undefined) attempt(() => this.assetLease!.release());
    }
    if (firstFailure !== undefined) {
      throw assetError("SUBJECT_ASSET_DISPOSE_FAILED", this.assetDescriptor);
    }
  }
}

export async function createSubjectVisual(
  options: CreateSubjectVisualOptionsV1,
): Promise<SubjectVisual> {
  const { subject, executionPlan, material, scene, subjectAssetCache } = options;
  const root = new TransformNode(`${subject.entityId}.visual-root`, scene);
  root.metadata = {
    worldkitEntityId: subject.entityId,
    semanticClassId: subject.semanticClassId,
  };
  const primitiveMeshes: Mesh[] = [];
  const allMeshes: AbstractMesh[] = [];
  const assetPartRoots: TransformNode[] = [];
  const staticAssetPartResetStates: StaticAssetPartResetStateV1[] = [];
  const socketNodesById = new Map<string, TransformNode>();
  let assetLease: SubjectAssetLeaseV1 | undefined;
  let assetInstance: SubjectAssetInstanceV1 | undefined;
  let animationPlayer: SubjectAnimationPlayer | undefined;
  let assetDescriptor: ExecutionSubjectAssetV1 | undefined;
  let staticOwnedMaterial: Material | undefined;

  try {
    const assetParts = subject.visualParts.filter((part) => part.kind === "asset");
    if (subject.visualBinding.mode === "rigged" && assetParts.length !== 1) {
      throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE");
    }
    if (subject.visualBinding.mode === "static" && assetParts.length > 1) {
      throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE");
    }
    if (subject.visualBinding.mode === "static" && assetParts.length > 0) {
      assetDescriptor = exactResource(
        executionPlan.subjectAssets,
        assetParts[0]!.subjectAssetRef,
        (resource) => resource.subjectAssetRef,
        "SUBJECT_ASSET_RIG_INCOMPATIBLE",
      );
      const clonedMaterial = material.clone(
        `${subject.entityId}.static-subject-material`,
      );
      if (clonedMaterial === null) {
        throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE", assetDescriptor);
      }
      staticOwnedMaterial = clonedMaterial;
    }
    for (const part of subject.visualParts) {
      if (part.kind === "primitive") {
        const mesh = createPartMesh(subject.entityId, part, scene);
        mesh.parent = root;
        applyLocalTransform(mesh, part.localTransform);
        mesh.material = staticOwnedMaterial ?? material;
        mesh.metadata = {
          worldkitEntityId: subject.entityId,
          subjectVisualPartId: part.id,
          semanticClassId: subject.semanticClassId,
          semanticTags: [...part.semanticTags],
        };
        primitiveMeshes.push(mesh);
        allMeshes.push(mesh);
        continue;
      }

      const asset = exactResource(
        executionPlan.subjectAssets,
        part.subjectAssetRef,
        (resource) => resource.subjectAssetRef,
        "SUBJECT_ASSET_RIG_INCOMPATIBLE",
      );
      assetDescriptor = asset;
      assetLease = await subjectAssetCache.acquire(asset);
      assetInstance = assetLease.instantiate(subject.entityId);
      const partRoot = new TransformNode(`${subject.entityId}.${part.id}`, scene);
      partRoot.parent = root;
      applyLocalTransform(partRoot, part.localTransform);
      partRoot.scaling = new Vector3(...part.localTransform.scaleXYZ);
      assetPartRoots.push(partRoot);
      for (const importedRoot of assetInstance.rootNodes) importedRoot.parent = partRoot;
      for (const mesh of assetInstance.meshes) {
        mesh.material = staticOwnedMaterial ?? material;
        mesh.metadata = {
          worldkitEntityId: subject.entityId,
          subjectVisualPartId: part.id,
          semanticClassId: subject.semanticClassId,
          semanticTags: [...part.semanticTags],
        };
        allMeshes.push(mesh);
      }

      if (subject.visualBinding.mode === "static") {
        staticAssetPartResetStates.push({
          node: partRoot,
          position: partRoot.position.clone(),
          rotationQuaternion: partRoot.rotationQuaternion!.clone(),
          scaling: partRoot.scaling.clone(),
        });
        continue;
      }
      const rigProfile = exactResource(
        executionPlan.rigProfiles,
        subject.visualBinding.rigProfileRef,
        (resource) => resource.rigProfileRef,
        "SUBJECT_ASSET_RIG_INCOMPATIBLE",
        asset,
      );
      const animationSet = exactResource(
        executionPlan.animationSets,
        subject.visualBinding.animationSetRef,
        (resource) => resource.animationSetRef,
        "SUBJECT_ASSET_ANIMATION_MISSING",
        asset,
      );
      if (
        animationSet.subjectAssetRef !== asset.subjectAssetRef ||
        animationSet.rigProfileRef !== rigProfile.rigProfileRef
      ) {
        throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE", asset);
      }
      const { mappedBones, skeletonRootBone } = validateRig(
        assetInstance,
        rigProfile,
        asset,
      );
      validateRootMotion(
        assetInstance.animationGroups,
        skeletonRootBone,
        mappedBones,
        asset,
      );
      const affectedMeshes = assetInstance.meshes
        .filter(
          (mesh) =>
            mesh.skeleton === assetInstance!.skeletons[0] &&
            isDescendantOfAnyRoot(mesh, assetInstance!.rootNodes),
        )
        .sort((left, right) =>
          left.name.localeCompare(right.name) || left.uniqueId - right.uniqueId,
        );

      for (const socket of subject.sockets) {
        let socketNode: TransformNode;
        if (socket.kind === "local") {
          socketNode = new TransformNode(
            `${subject.entityId}.socket.${socket.id}`,
            scene,
          );
          socketNode.parent = root;
          applyLocalTransform(socketNode, socket.localTransform);
        } else {
          const bone = mappedBones.get(socket.boneId);
          if (bone === undefined) {
            throw assetError("SUBJECT_ASSET_SOCKET_BONE_MISSING", asset);
          }
          const affectedMesh = affectedMeshes[0];
          if (affectedMesh === undefined) {
            throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE", asset);
          }
          socketNode = new TransformNode(
            `${subject.entityId}.socket.${socket.id}`,
            scene,
          );
          socketNode.attachToBone(bone, affectedMesh);
          applyLocalTransform(socketNode, socket.offsetTransform);
        }
        socketNode.metadata = {
          worldkitEntityId: subject.entityId,
          subjectSocketId: socket.id,
          semanticTags: [...socket.semanticTags],
        };
        socketNodesById.set(socket.id, socketNode);
      }
      animationPlayer = new SubjectAnimationPlayer({
        animationGroups: assetInstance.animationGroups,
        animationSet,
        subjectAssetRef: asset.subjectAssetRef,
        artifactContentHash: asset.artifactContentHash,
      });
    }

    if (subject.visualBinding.mode === "static") {
      for (const socket of subject.sockets) {
        if (socket.kind !== "local") {
          throw assetError("SUBJECT_ASSET_SOCKET_BONE_MISSING", assetDescriptor);
        }
        const socketNode = new TransformNode(
          `${subject.entityId}.socket.${socket.id}`,
          scene,
        );
        socketNode.parent = root;
        applyLocalTransform(socketNode, socket.localTransform);
        socketNode.metadata = {
          worldkitEntityId: subject.entityId,
          subjectSocketId: socket.id,
          semanticTags: [...socket.semanticTags],
        };
        socketNodesById.set(socket.id, socketNode);
      }
    }

    return new OwnedSubjectVisual(
      root,
      allMeshes,
      socketNodesById,
      primitiveMeshes,
      assetPartRoots,
      staticAssetPartResetStates,
      staticOwnedMaterial,
      animationPlayer,
      assetDescriptor,
      assetInstance,
      assetLease,
    );
  } catch (error) {
    const attempt = (dispose: () => void): void => {
      try {
        dispose();
      } catch {
        // Preserve the primary stable construction diagnostic.
      }
    };
    if (subject.visualBinding.mode === "static") {
      attempt(() => assetInstance?.dispose());
      attempt(() => assetLease?.release());
      disposeSubjectSocketsAndPrimitives(
        socketNodesById,
        primitiveMeshes,
        attempt,
      );
      disposeSubjectAssetNodesAndMaterial(
        assetPartRoots,
        staticOwnedMaterial,
        root,
        attempt,
      );
    } else {
      attempt(() => animationPlayer?.dispose());
      disposeSubjectSocketsAndPrimitives(
        socketNodesById,
        primitiveMeshes,
        attempt,
      );
      attempt(() => assetInstance?.dispose());
      disposeSubjectAssetNodesAndMaterial(
        assetPartRoots,
        undefined,
        root,
        attempt,
      );
      attempt(() => assetLease?.release());
    }
    if (error instanceof SubjectAssetRuntimeErrorV1) throw error;
    throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE");
  }
}
