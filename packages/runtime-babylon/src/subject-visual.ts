import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import type { Bone } from "@babylonjs/core/Bones/bone.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import {
  type Matrix,
  Quaternion,
  Vector3,
} from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  JumpEpisodeStateV1,
} from "@whitebox-world/character-movement";
import type {
  GameplayActionStateV1,
} from "@whitebox-world/gameplay-contracts";
import type {
  RuntimeAnimationSetV1,
  RuntimeRigProfileV1,
  RuntimeSubjectAssetV1,
  RuntimeSubjectVisualPrimitivePartV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type { BabylonRuntimeSubjectV1 } from "./runtime-subject";
import type { GroundHumanoidActionIdV1 } from "@whitebox-world/subject-contracts";
import {
  type ActionPresentationRegistryV1,
  type ResolvedActionPresentationV1,
} from "@whitebox-world/subject-actions";

import { SubjectAnimationPlayer } from "./subject-animation-player";
import {
  SubjectAssetRuntimeErrorV1,
  type SubjectAssetCacheV1,
  type SubjectAssetInstanceV1,
  type SubjectAssetLeaseV1,
  type SubjectAssetRuntimeErrorCodeV1,
} from "./subject-asset-cache";
import { VerticalFootSupportAnchorV1 } from "./vertical-foot-support-anchor";

export interface SubjectVisual {
  root: TransformNode;
  meshes: readonly AbstractMesh[];
  socketNodesById: ReadonlyMap<string, TransformNode>;
  readonly activeActionId: GroundHumanoidActionIdV1;
  stepAnimation(
    presentation: ResolvedActionPresentationV1,
    committedActionState?: GameplayActionStateV1,
    jumpEpisode?: JumpEpisodeStateV1,
  ): void;
  applyAnimationPose(): void;
  resetAnimation(): void;
  dispose(): void;
}

function debugActionIdForPresentation(
  presentation: ResolvedActionPresentationV1,
): GroundHumanoidActionIdV1 {
  const key = presentation.presentationKey;
  if (key === "locomotion.walk") return "walk";
  if (key === "locomotion.run") return "run";
  if (key === "locomotion.small-jump.takeoff") return "jump.small.takeoff";
  if (key === "locomotion.small-jump.airborne") return "jump.small.airborne";
  if ([
    "locomotion.takeoff", "locomotion.rising", "locomotion.apex",
    "locomotion.falling", "locomotion.landing",
  ].includes(key)) return "jump";
  return "idle";
}

export interface CreateSubjectVisualOptionsV1 {
  subject: BabylonRuntimeSubjectV1;
  worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  material: Material;
  scene: Scene;
  subjectAssetCache: SubjectAssetCacheV1;
  actionPresentationRegistry: ActionPresentationRegistryV1;
}

function createPartMesh(
  subjectEntityId: string,
  part: RuntimeSubjectVisualPrimitivePartV1,
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
  asset?: RuntimeSubjectAssetV1,
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
  asset?: RuntimeSubjectAssetV1,
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
  rigProfile: RuntimeRigProfileV1,
  asset: RuntimeSubjectAssetV1,
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

const IN_PLACE_ROOT_TRANSLATION_LOOP_TOLERANCE_METERS = 0.0001;
const MAX_IN_PLACE_ROOT_TRANSLATION_SPAN_METERS = 0.5;
type RootTranslationTargetV1 = Bone | TransformNode;

function rootTranslationParentWorldMatrix(
  target: RootTranslationTargetV1,
): Matrix | undefined {
  if (target instanceof TransformNode) {
    return target.parent?.computeWorldMatrix(true);
  }
  const linkedNode = target.getTransformNode();
  if (linkedNode !== null) return rootTranslationParentWorldMatrix(linkedNode);
  const parentBone = target.getParent();
  if (parentBone === null) return undefined;
  parentBone.computeAbsoluteMatrices();
  return parentBone.getAbsoluteMatrix();
}

function positionKeyWorldVector(
  targetProperty: string,
  value: unknown,
  parentWorldMatrix: Matrix | undefined,
): Vector3 | undefined {
  let localValue: Vector3;
  if (/^position\.[xyz]$/.test(targetProperty)) {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    localValue = targetProperty === "position.x"
      ? new Vector3(value, 0, 0)
      : targetProperty === "position.y"
        ? new Vector3(0, value, 0)
        : new Vector3(0, 0, value);
  } else {
    if (targetProperty !== "position" || typeof value !== "object" || value === null) {
      return undefined;
    }
    const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
    if (
      typeof candidate.x !== "number" ||
      !Number.isFinite(candidate.x) ||
      typeof candidate.y !== "number" ||
      !Number.isFinite(candidate.y) ||
      typeof candidate.z !== "number" ||
      !Number.isFinite(candidate.z)
    ) {
      return undefined;
    }
    localValue = new Vector3(candidate.x, candidate.y, candidate.z);
  }
  const worldValue = parentWorldMatrix === undefined
    ? localValue
    : Vector3.TransformNormal(localValue, parentWorldMatrix);
  return worldValue.asArray().every((component) => Number.isFinite(component))
    ? worldValue
    : undefined;
}

function isBoundedRootTranslationSequence(
  target: RootTranslationTargetV1,
  targetProperty: string,
  phaseKeys: readonly (readonly { value: unknown }[])[],
  sequenceMustClose: boolean,
): boolean {
  if (phaseKeys.length === 0 || phaseKeys.some((keys) => keys.length === 0)) {
    return false;
  }
  const parentWorldMatrix = rootTranslationParentWorldMatrix(target);
  const phaseValues = phaseKeys.map((keys) => keys.map((key) =>
    positionKeyWorldVector(targetProperty, key.value, parentWorldMatrix)
  ));
  if (phaseValues.some((values) => values.some((value) => value === undefined))) {
    return false;
  }
  const definedPhaseValues = phaseValues as readonly (readonly Vector3[])[];
  const values = definedPhaseValues.flat();
  const first = values[0]!;
  const last = values.at(-1)!;
  if (
    sequenceMustClose &&
    Vector3.Distance(last, first) > IN_PLACE_ROOT_TRANSLATION_LOOP_TOLERANCE_METERS
  ) {
    return false;
  }
  const minimum = values.reduce(
    (result, value) => Vector3.Minimize(result, value),
    first.clone(),
  );
  const maximum = values.reduce(
    (result, value) => Vector3.Maximize(result, value),
    first.clone(),
  );
  if (Vector3.Distance(minimum, maximum) > MAX_IN_PLACE_ROOT_TRANSLATION_SPAN_METERS) {
    return false;
  }
  for (let phaseIndex = 1; phaseIndex < definedPhaseValues.length; phaseIndex += 1) {
    const previous = definedPhaseValues[phaseIndex - 1]!.at(-1)!;
    const current = definedPhaseValues[phaseIndex]![0]!;
    if (Vector3.Distance(previous, current) >
      IN_PLACE_ROOT_TRANSLATION_LOOP_TOLERANCE_METERS) {
      return false;
    }
  }
  return true;
}

interface RootTranslationTrackV1 {
  readonly target: RootTranslationTargetV1;
  readonly targetProperty: string;
  readonly keys: readonly { value: unknown }[];
}

function rootTranslationTracks(
  group: AnimationGroup,
  rootTargets: ReadonlySet<unknown>,
): readonly RootTranslationTrackV1[] {
  return group.targetedAnimations.flatMap((targeted) =>
    rootTargets.has(targeted.target) &&
      targeted.animation.targetProperty.startsWith("position")
      ? [{
          target: targeted.target as RootTranslationTargetV1,
          targetProperty: targeted.animation.targetProperty,
          keys: targeted.animation.getKeys(),
        }]
      : []
  );
}

function validateRootMotion(
  animationGroups: readonly AnimationGroup[],
  skeletonRootBone: Bone,
  mappedBones: ReadonlyMap<string, Bone>,
  animationSet: RuntimeAnimationSetV1,
  asset: RuntimeSubjectAssetV1,
): void {
  const rootTargets = new Set<unknown>();
  for (const bone of [skeletonRootBone, mappedBones.get("hips")]) {
    if (bone === undefined) continue;
    rootTargets.add(bone);
    const transformNode = bone.getTransformNode();
    if (transformNode !== null) rootTargets.add(transformNode);
  }
  const tracksByGroup = new Map<AnimationGroup, readonly RootTranslationTrackV1[]>();
  for (const group of animationGroups) {
    const tracks = rootTranslationTracks(group, rootTargets);
    tracksByGroup.set(group, tracks);
    if (tracks.length === 0) continue;
    const bindings = animationSet.animationBindings.filter(
      (binding) => binding.sourceClipName === group.name,
    );
    if (bindings.length !== 1 || bindings[0]!.rootMotionMode !== "in-place") {
      throw assetError("SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED", asset);
    }
    for (const track of tracks) {
      if (!isBoundedRootTranslationSequence(
        track.target,
        track.targetProperty,
        [track.keys],
        bindings[0]!.loopMode === "repeat",
      )) {
        throw assetError("SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED", asset);
      }
    }
  }

  const splitJumpBindings = ["jump.small.takeoff", "jump.small.airborne"].map(
    (actionId) => animationSet.animationBindings.filter(
      (binding) => binding.actionId === actionId,
    ),
  );
  if (splitJumpBindings.every((bindings) => bindings.length === 0)) return;
  if (splitJumpBindings.some((bindings) => bindings.length !== 1)) {
    throw assetError("SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED", asset);
  }
  const splitJumpGroups = splitJumpBindings.map((bindings) => {
    const matches = animationGroups.filter(
      (group) => group.name === bindings[0]!.sourceClipName,
    );
    if (matches.length !== 1) {
      throw assetError("SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED", asset);
    }
    return matches[0]!;
  });
  const splitJumpTracks = splitJumpGroups.map((group) => tracksByGroup.get(group) ?? []);
  const referenceTracks = splitJumpTracks[0]!;
  if (splitJumpTracks.some((tracks) => tracks.length !== referenceTracks.length)) {
    throw assetError("SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED", asset);
  }
  for (const reference of referenceTracks) {
    const matches = splitJumpTracks.map((tracks) => tracks.filter(
      (candidate) =>
        candidate.target === reference.target &&
        candidate.targetProperty === reference.targetProperty,
    ));
    if (matches.some((matching) => matching.length !== 1)) {
      throw assetError("SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED", asset);
    }
    if (!isBoundedRootTranslationSequence(
      reference.target,
      reference.targetProperty,
      matches.map((matching) => matching[0]!.keys),
      false,
    )) {
      throw assetError("SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED", asset);
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

function ownedVisualAnimationTargets(
  assetInstance: SubjectAssetInstanceV1,
): ReadonlySet<object> {
  const targets = new Set<object>();
  for (const root of assetInstance.rootNodes) {
    targets.add(root);
    for (const descendant of root.getDescendants(false)) targets.add(descendant);
  }
  for (const mesh of assetInstance.meshes) {
    targets.add(mesh);
    const manager = mesh.morphTargetManager;
    if (manager === null) continue;
    for (let index = 0; index < manager.numTargets; index += 1) {
      const target = manager.getTarget(index);
      if (target !== null) targets.add(target);
    }
  }
  for (const skeleton of assetInstance.skeletons) {
    for (const bone of skeleton.bones) {
      targets.add(bone);
      const transformNode = bone.getTransformNode();
      if (transformNode !== null) targets.add(transformNode);
    }
  }
  return targets;
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
  visualAdjustmentRoot: TransformNode | undefined,
  root: TransformNode,
  attempt: CleanupAttemptV1,
): void {
  for (const partRoot of [...assetPartRoots].reverse()) {
    attempt(() => partRoot.dispose(false, false));
  }
  attempt(() => staticOwnedMaterial?.dispose(false, false));
  attempt(() => visualAdjustmentRoot?.dispose(false, false));
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
    readonly visualAdjustmentRoot: TransformNode | undefined,
    private readonly verticalFootSupportAnchor:
      VerticalFootSupportAnchorV1 | undefined,
    private readonly assetDescriptor: RuntimeSubjectAssetV1 | undefined,
    private readonly assetInstance: SubjectAssetInstanceV1 | undefined,
    private readonly assetLease: SubjectAssetLeaseV1 | undefined,
  ) {}

  get activeActionId(): GroundHumanoidActionIdV1 {
    return this.animationPlayer?.activeActionId ?? this.fallbackActionId;
  }

  stepAnimation(
    presentation: ResolvedActionPresentationV1,
    committedActionState?: GameplayActionStateV1,
    jumpEpisode?: JumpEpisodeStateV1,
  ): void {
    this.fallbackActionId = debugActionIdForPresentation(presentation);
    this.animationPlayer?.step(presentation, committedActionState);
    this.verticalFootSupportAnchor?.updateCommittedProjection({
      committedTick: presentation.committedTick,
      presentationKey: presentation.presentationKey,
      ...(jumpEpisode === undefined ? {} : { jumpEpisode }),
    });
  }

  applyAnimationPose(): void {
    this.animationPlayer?.applyPose();
    this.verticalFootSupportAnchor?.applyAfterPose();
  }

  resetAnimation(): void {
    this.fallbackActionId = "idle";
    this.verticalFootSupportAnchor?.reset();
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
        this.visualAdjustmentRoot,
        this.root,
        attempt,
      );
    } else {
      attempt(() => this.verticalFootSupportAnchor?.dispose());
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
        this.visualAdjustmentRoot,
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
  const {
    subject,
    worldRuntimeBootstrap,
    material,
    scene,
    subjectAssetCache,
    actionPresentationRegistry,
  } = options;
  const root = new TransformNode(`${subject.entityId}.visual-root`, scene);
  root.metadata = {
    worldkitEntityId: subject.entityId,
    semanticClassId: subject.semanticClassId,
  };
  const visualAdjustmentRoot = subject.visualBinding.mode === "rigged"
    ? new TransformNode(`${subject.entityId}.visual-adjustment-root`, scene)
    : undefined;
  if (visualAdjustmentRoot !== undefined) visualAdjustmentRoot.parent = root;
  const primitiveMeshes: Mesh[] = [];
  const allMeshes: AbstractMesh[] = [];
  const assetPartRoots: TransformNode[] = [];
  const staticAssetPartResetStates: StaticAssetPartResetStateV1[] = [];
  const socketNodesById = new Map<string, TransformNode>();
  let assetLease: SubjectAssetLeaseV1 | undefined;
  let assetInstance: SubjectAssetInstanceV1 | undefined;
  let animationPlayer: SubjectAnimationPlayer | undefined;
  let verticalFootSupportAnchor: VerticalFootSupportAnchorV1 | undefined;
  let assetDescriptor: RuntimeSubjectAssetV1 | undefined;
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
        worldRuntimeBootstrap.subjectAssets,
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
        mesh.parent = visualAdjustmentRoot ?? root;
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
        worldRuntimeBootstrap.subjectAssets,
        part.subjectAssetRef,
        (resource) => resource.subjectAssetRef,
        "SUBJECT_ASSET_RIG_INCOMPATIBLE",
      );
      assetDescriptor = asset;
      assetLease = await subjectAssetCache.acquire(asset);
      assetInstance = assetLease.instantiate(subject.entityId);
      const partRoot = new TransformNode(`${subject.entityId}.${part.id}`, scene);
      partRoot.parent = visualAdjustmentRoot ?? root;
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
        worldRuntimeBootstrap.rigProfiles,
        subject.visualBinding.rigProfileRef,
        (resource) => resource.rigProfileRef,
        "SUBJECT_ASSET_RIG_INCOMPATIBLE",
        asset,
      );
      const animationSet = exactResource(
        worldRuntimeBootstrap.animationSets,
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
        animationSet,
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
      const leftFoot = mappedBones.get("foot.left");
      const rightFoot = mappedBones.get("foot.right");
      const anchorMesh = affectedMeshes[0];
      const anchorSkeleton = assetInstance.skeletons[0];
      if (visualAdjustmentRoot !== undefined && leftFoot !== undefined &&
        rightFoot !== undefined && anchorMesh !== undefined &&
        anchorSkeleton !== undefined) {
        verticalFootSupportAnchor = new VerticalFootSupportAnchorV1({
          readAdjustmentOffsetY: () => visualAdjustmentRoot.position.y,
          writeAdjustmentOffsetY: (value) => {
            visualAdjustmentRoot.position.y = value;
          },
          sampleMinimumFootHeightFromVisualRoot: () => {
            root.computeWorldMatrix(true);
            anchorMesh.computeWorldMatrix(true);
            anchorSkeleton.prepare(true);
            const inverseRoot = root.getWorldMatrix().clone().invert();
            const leftPosition = Vector3.TransformCoordinates(
              leftFoot.getAbsolutePosition(anchorMesh),
              inverseRoot,
            );
            const rightPosition = Vector3.TransformCoordinates(
              rightFoot.getAbsolutePosition(anchorMesh),
              inverseRoot,
            );
            return Math.min(leftPosition.y, rightPosition.y);
          },
        });
      }

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
        actionPresentationRegistry,
        authorityTransformNode: root,
        ownedVisualAnimationTargets: ownedVisualAnimationTargets(assetInstance),
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
      visualAdjustmentRoot,
      verticalFootSupportAnchor,
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
        visualAdjustmentRoot,
        root,
        attempt,
      );
    } else {
      attempt(() => verticalFootSupportAnchor?.dispose());
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
        visualAdjustmentRoot,
        root,
        attempt,
      );
      attempt(() => assetLease?.release());
    }
    if (error instanceof SubjectAssetRuntimeErrorV1) throw error;
    throw assetError("SUBJECT_ASSET_RIG_INCOMPATIBLE");
  }
}
